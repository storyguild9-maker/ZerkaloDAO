tolk 1.4.2

const ACTION_ALLOCATE = 1
const ACTION_WITHDRAW = 2
const ACTION_SET_POLICY = 3
const ACTION_PAUSE = 4
const ACTION_UNPAUSE = 5

const POLICY_MIN_RESERVE = 1
const POLICY_MAX_PER_ACTION = 2
const POLICY_MAX_DAILY = 3
const POLICY_EXECUTION_DELAY = 4

const ACTION_STATUS_SCHEDULED = 1
const ACTION_STATUS_EXECUTING = 2
const ACTION_STATUS_EXECUTED = 3

const ERR_UNAUTHORIZED = 100
const ERR_ALREADY_BOUND = 101
const ERR_NOT_BOUND = 102
const ERR_INVALID_ADAPTER = 103
const ERR_DUPLICATE = 104
const ERR_INVALID_ACTION = 105
const ERR_TOO_EARLY = 106
const ERR_EXPIRED = 107
const ERR_PAUSED = 108
const ERR_LIMIT = 109
const ERR_RESERVE = 110
const ERR_INVALID_POLICY = 111
const ERR_NOT_SCHEDULED = 112
const ERR_BAD_VALUE = 113

struct VaultCore {
    bootstrapOwner: address
    governanceAddress: address
    emergencyGuardian: address
    isBound: bool
    paused: bool
}

struct PolicyBounds {
    immutableMinReserve: coins
    immutableMaxPerAction: coins
    immutableMaxDaily: coins
    minDelay: uint32
    maxDelay: uint32
    executionWindow: uint32
}

struct VaultPolicy {
    minReserve: coins
    maxPerAction: coins
    maxDaily: coins
    executionDelay: uint32
    spentDay: uint32
    spentToday: coins
    bounds: Cell<PolicyBounds>
}

struct AdapterConfig {
    adapterAddress: address
    enabled: bool
    maxPerAction: coins
}

struct ScheduledAction {
    actionKind: uint8
    adapterId: uint16
    amount: coins
    policyKey: uint8
    policyValue: coins
    executeAfter: uint32
    expiresAt: uint32
    status: uint8
}

struct VaultStorage {
    core: Cell<VaultCore>
    policy: Cell<VaultPolicy>
    adapters: map<uint16, AdapterConfig>
    scheduledActions: map<uint64, ScheduledAction>
}

fun VaultStorage.load() {
    return VaultStorage.fromCell(contract.getData())
}

fun VaultStorage.save(self) {
    contract.setData(self.toCell())
}

struct (0x5a11a001) BindGovernance {
    queryId: uint64
    governanceAddress: address
}

struct (0x5a11a002) RegisterAdapter {
    queryId: uint64
    adapterId: uint16
    adapterAddress: address
    maxPerAction: coins
}

struct (0x5a11a003) VaultDeposit {
    queryId: uint64
    memberAddress: address
    amount: coins
}

struct (0x5a11a004) ScheduleAction {
    queryId: uint64
    proposalId: uint64
    actionKind: uint8
    adapterId: uint16
    amount: coins
    policyKey: uint8
    policyValue: coins
}

struct (0x5a11a005) ExecuteAction {
    queryId: uint64
    proposalId: uint64
}

struct (0x5a11a006) EmergencyPause {
    queryId: uint64
}

struct (0x5a11a007) AdapterReturn {
    queryId: uint64
    proposalId: uint64
    adapterId: uint16
    amount: coins
}

struct (0x5a11a008) AdapterReceipt {
    queryId: uint64
    proposalId: uint64
    adapterId: uint16
    actionKind: uint8
    amount: coins
}

struct (0x5a11b001) DepositAccepted {
    queryId: uint64
    memberAddress: address
    amount: coins
}

struct (0x5a11b002) ActionScheduled {
    queryId: uint64
    proposalId: uint64
    executeAfter: uint32
    expiresAt: uint32
}

struct (0x5a11b003) ActionExecuted {
    queryId: uint64
    proposalId: uint64
    actionKind: uint8
}

struct (0x5a11c001) AdapterAllocate {
    queryId: uint64
    proposalId: uint64
}

struct (0x5a11c002) AdapterWithdraw {
    queryId: uint64
    proposalId: uint64
    amount: coins
    adapterId: uint16
}

type AllowedMessage = BindGovernance | RegisterAdapter | VaultDeposit | ScheduleAction | ExecuteAction | EmergencyPause | AdapterReturn | AdapterReceipt
type BounceableAdapterMessage = AdapterAllocate | AdapterWithdraw

fun sendDepositAccepted(governanceAddress: address, msg: VaultDeposit) {
    createMessage({
        bounce: BounceMode.NoBounce,
        value: grams("0.01"),
        dest: governanceAddress,
        body: DepositAccepted {
            queryId: msg.queryId,
            memberAddress: msg.memberAddress,
            amount: msg.amount,
        }
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun sendActionScheduled(governanceAddress: address, queryId: uint64, proposalId: uint64, action: ScheduledAction) {
    createMessage({
        bounce: BounceMode.NoBounce,
        value: grams("0.01"),
        dest: governanceAddress,
        body: ActionScheduled {
            queryId,
            proposalId,
            executeAfter: action.executeAfter,
            expiresAt: action.expiresAt,
        }
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun actionMatchesMessage(action: ScheduledAction, msg: ScheduleAction): bool {
    return action.actionKind == msg.actionKind
        && action.adapterId == msg.adapterId
        && action.amount == msg.amount
        && action.policyKey == msg.policyKey
        && action.policyValue == msg.policyValue;
}

fun validateActionShape(msg: ScheduleAction) {
    if (msg.actionKind == ACTION_ALLOCATE || msg.actionKind == ACTION_WITHDRAW) {
        assert (msg.adapterId > 0 && msg.amount > 0 && msg.policyKey == 0 && msg.policyValue == 0) throw ERR_INVALID_ACTION;
        return;
    }
    if (msg.actionKind == ACTION_SET_POLICY) {
        assert (msg.adapterId == 0 && msg.amount == 0 && msg.policyKey >= POLICY_MIN_RESERVE && msg.policyKey <= POLICY_EXECUTION_DELAY) throw ERR_INVALID_ACTION;
        return;
    }
    if (msg.actionKind == ACTION_PAUSE || msg.actionKind == ACTION_UNPAUSE) {
        assert (msg.adapterId == 0 && msg.amount == 0 && msg.policyKey == 0 && msg.policyValue == 0) throw ERR_INVALID_ACTION;
        return;
    }
    throw ERR_INVALID_ACTION;
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);
    var storage = lazy VaultStorage.load();
    var core = storage.core.load();

    match (msg) {
        BindGovernance => {
            assert (in.senderAddress == core.bootstrapOwner) throw ERR_UNAUTHORIZED;
            assert (!core.isBound) throw ERR_ALREADY_BOUND;
            core.governanceAddress = msg.governanceAddress;
            core.isBound = true;
            storage.core = core.toCell();
            storage.save();
        }

        RegisterAdapter => {
            assert (in.senderAddress == core.bootstrapOwner) throw ERR_UNAUTHORIZED;
            assert (!core.isBound) throw ERR_ALREADY_BOUND;
            assert (msg.adapterId > 0 && msg.maxPerAction > 0) throw ERR_INVALID_ADAPTER;
            assert (!storage.adapters.exists(msg.adapterId)) throw ERR_DUPLICATE;
            storage.adapters.set(msg.adapterId, {
                adapterAddress: msg.adapterAddress,
                enabled: true,
                maxPerAction: msg.maxPerAction,
            });
            storage.save();
        }

        VaultDeposit => {
            assert (core.isBound) throw ERR_NOT_BOUND;
            assert (in.senderAddress == core.governanceAddress) throw ERR_UNAUTHORIZED;
            assert (msg.amount > 0 && in.valueCoins >= msg.amount) throw ERR_BAD_VALUE;
            sendDepositAccepted(core.governanceAddress, msg);
        }

        ScheduleAction => {
            assert (core.isBound) throw ERR_NOT_BOUND;
            assert (in.senderAddress == core.governanceAddress) throw ERR_UNAUTHORIZED;
            validateActionShape(msg);
            if (msg.actionKind == ACTION_ALLOCATE || msg.actionKind == ACTION_WITHDRAW) {
                assert (storage.adapters.exists(msg.adapterId)) throw ERR_INVALID_ADAPTER;
            }
            val existing = storage.scheduledActions.get(msg.proposalId);
            if (existing.isFound) {
                val action = existing.loadValue();
                assert (actionMatchesMessage(action, msg)) throw ERR_DUPLICATE;
                sendActionScheduled(core.governanceAddress, msg.queryId, msg.proposalId, action);
                return;
            }

            val policy = storage.policy.load();
            val bounds = policy.bounds.load();
            val executeAfter = blockchain.now() + policy.executionDelay;
            val action: ScheduledAction = {
                actionKind: msg.actionKind,
                adapterId: msg.adapterId,
                amount: msg.amount,
                policyKey: msg.policyKey,
                policyValue: msg.policyValue,
                executeAfter: executeAfter as uint32,
                expiresAt: (executeAfter + bounds.executionWindow) as uint32,
                status: ACTION_STATUS_SCHEDULED,
            };
            storage.scheduledActions.set(msg.proposalId, action);
            storage.save();
            sendActionScheduled(core.governanceAddress, msg.queryId, msg.proposalId, action);
        }

        ExecuteAction => {
            val actionLookup = storage.scheduledActions.get(msg.proposalId);
            assert (actionLookup.isFound) throw ERR_NOT_SCHEDULED;
            var action = actionLookup.loadValue();
            assert (action.status == ACTION_STATUS_SCHEDULED) throw ERR_NOT_SCHEDULED;
            assert (blockchain.now() >= action.executeAfter) throw ERR_TOO_EARLY;
            assert (blockchain.now() <= action.expiresAt) throw ERR_EXPIRED;

            var policy = storage.policy.load();
            val bounds = policy.bounds.load();
            val currentDay = (blockchain.now() / 86400) as uint32;
            if (policy.spentDay != currentDay) {
                policy.spentDay = currentDay;
                policy.spentToday = 0;
            }
            action.status = ACTION_STATUS_EXECUTING;
            storage.scheduledActions.set(msg.proposalId, action);

            if (action.actionKind == ACTION_ALLOCATE) {
                assert (!core.paused) throw ERR_PAUSED;
                val adapter = storage.adapters.mustGet(action.adapterId, ERR_INVALID_ADAPTER);
                assert (adapter.enabled) throw ERR_INVALID_ADAPTER;
                assert (action.amount <= policy.maxPerAction && action.amount <= adapter.maxPerAction) throw ERR_LIMIT;
                assert (policy.spentToday + action.amount <= policy.maxDaily) throw ERR_LIMIT;
                assert (contract.getOriginalBalance() >= action.amount + policy.minReserve) throw ERR_RESERVE;
                policy.spentToday += action.amount;
                storage.policy = policy.toCell();
                storage.save();
                createMessage({
                    bounce: BounceMode.RichBounce,
                    value: action.amount,
                    dest: adapter.adapterAddress,
                    body: AdapterAllocate { queryId: msg.queryId, proposalId: msg.proposalId }
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
                return;
            } else if (action.actionKind == ACTION_WITHDRAW) {
                val adapter = storage.adapters.mustGet(action.adapterId, ERR_INVALID_ADAPTER);
                assert (adapter.enabled) throw ERR_INVALID_ADAPTER;
                storage.policy = policy.toCell();
                storage.save();
                createMessage({
                    bounce: BounceMode.RichBounce,
                    value: grams("0.05"),
                    dest: adapter.adapterAddress,
                    body: AdapterWithdraw {
                        queryId: msg.queryId,
                        proposalId: msg.proposalId,
                        amount: action.amount,
                        adapterId: action.adapterId,
                    }
                }).send(SEND_MODE_PAY_FEES_SEPARATELY);
                return;
            } else if (action.actionKind == ACTION_SET_POLICY) {
                if (action.policyKey == POLICY_MIN_RESERVE) {
                    assert (action.policyValue >= bounds.immutableMinReserve) throw ERR_INVALID_POLICY;
                    policy.minReserve = action.policyValue;
                } else if (action.policyKey == POLICY_MAX_PER_ACTION) {
                    assert (action.policyValue > 0 && action.policyValue <= bounds.immutableMaxPerAction) throw ERR_INVALID_POLICY;
                    policy.maxPerAction = action.policyValue;
                } else if (action.policyKey == POLICY_MAX_DAILY) {
                    assert (action.policyValue > 0 && action.policyValue <= bounds.immutableMaxDaily) throw ERR_INVALID_POLICY;
                    policy.maxDaily = action.policyValue;
                } else if (action.policyKey == POLICY_EXECUTION_DELAY) {
                    assert (action.policyValue >= bounds.minDelay && action.policyValue <= bounds.maxDelay) throw ERR_INVALID_POLICY;
                    policy.executionDelay = action.policyValue as uint32;
                } else {
                    throw ERR_INVALID_POLICY;
                }
                storage.policy = policy.toCell();
                storage.save();
            } else if (action.actionKind == ACTION_PAUSE) {
                core.paused = true;
                storage.core = core.toCell();
                storage.policy = policy.toCell();
                storage.save();
            } else if (action.actionKind == ACTION_UNPAUSE) {
                core.paused = false;
                storage.core = core.toCell();
                storage.policy = policy.toCell();
                storage.save();
            } else {
                throw ERR_INVALID_ACTION;
            }

            action.status = ACTION_STATUS_EXECUTED;
            storage.scheduledActions.set(msg.proposalId, action);
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.01"),
                dest: core.governanceAddress,
                body: ActionExecuted {
                    queryId: msg.queryId,
                    proposalId: msg.proposalId,
                    actionKind: action.actionKind,
                }
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        EmergencyPause => {
            assert (in.senderAddress == core.emergencyGuardian) throw ERR_UNAUTHORIZED;
            core.paused = true;
            storage.core = core.toCell();
            storage.save();
        }

        AdapterReturn => {
            val adapter = storage.adapters.mustGet(msg.adapterId, ERR_INVALID_ADAPTER);
            assert (in.senderAddress == adapter.adapterAddress) throw ERR_UNAUTHORIZED;
            assert (in.valueCoins >= msg.amount) throw ERR_BAD_VALUE;
            var action = storage.scheduledActions.mustGet(msg.proposalId, ERR_NOT_SCHEDULED);
            assert (action.status == ACTION_STATUS_EXECUTING) throw ERR_NOT_SCHEDULED;
            assert (action.actionKind == ACTION_WITHDRAW && action.adapterId == msg.adapterId && action.amount == msg.amount) throw ERR_INVALID_ACTION;
            action.status = ACTION_STATUS_EXECUTED;
            storage.scheduledActions.set(msg.proposalId, action);
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.01"),
                dest: core.governanceAddress,
                body: ActionExecuted {
                    queryId: msg.queryId,
                    proposalId: msg.proposalId,
                    actionKind: action.actionKind,
                }
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        AdapterReceipt => {
            val adapter = storage.adapters.mustGet(msg.adapterId, ERR_INVALID_ADAPTER);
            assert (in.senderAddress == adapter.adapterAddress) throw ERR_UNAUTHORIZED;
            var action = storage.scheduledActions.mustGet(msg.proposalId, ERR_NOT_SCHEDULED);
            assert (action.status == ACTION_STATUS_EXECUTING) throw ERR_NOT_SCHEDULED;
            assert (action.actionKind == msg.actionKind && action.adapterId == msg.adapterId && action.amount == msg.amount) throw ERR_INVALID_ACTION;
            action.status = ACTION_STATUS_EXECUTED;
            storage.scheduledActions.set(msg.proposalId, action);
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.01"),
                dest: core.governanceAddress,
                body: ActionExecuted {
                    queryId: msg.queryId,
                    proposalId: msg.proposalId,
                    actionKind: action.actionKind,
                }
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    var storage = lazy VaultStorage.load();
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val original = lazy BounceableAdapterMessage.fromCell(rich.originalBody);
    match (original) {
        AdapterAllocate => {
            var action = storage.scheduledActions.mustGet(original.proposalId, ERR_NOT_SCHEDULED);
            if (action.status != ACTION_STATUS_EXECUTING || action.actionKind != ACTION_ALLOCATE) {
                return;
            }
            val adapter = storage.adapters.mustGet(action.adapterId, ERR_INVALID_ADAPTER);
            if (in.senderAddress != adapter.adapterAddress) {
                return;
            }
            var policy = storage.policy.load();
            if (policy.spentToday >= action.amount) {
                policy.spentToday -= action.amount;
            }
            action.status = ACTION_STATUS_SCHEDULED;
            storage.policy = policy.toCell();
            storage.scheduledActions.set(original.proposalId, action);
            storage.save();
        }
        AdapterWithdraw => {
            var action = storage.scheduledActions.mustGet(original.proposalId, ERR_NOT_SCHEDULED);
            if (action.status != ACTION_STATUS_EXECUTING || action.actionKind != ACTION_WITHDRAW) {
                return;
            }
            val adapter = storage.adapters.mustGet(action.adapterId, ERR_INVALID_ADAPTER);
            if (in.senderAddress != adapter.adapterAddress) {
                return;
            }
            action.status = ACTION_STATUS_SCHEDULED;
            storage.scheduledActions.set(original.proposalId, action);
            storage.save();
        }
        else => {}
    }
}

get fun vaultState(): (bool, bool, coins, coins, coins, uint32, uint32, uint32, coins) {
    val storage = lazy VaultStorage.load();
    val core = storage.core.load();
    val policy = storage.policy.load();
    val bounds = policy.bounds.load();
    return (
        core.isBound,
        core.paused,
        policy.minReserve,
        policy.maxPerAction,
        policy.maxDaily,
        policy.executionDelay,
        bounds.minDelay,
        bounds.maxDelay,
        policy.spentToday
    );
}

get fun governanceAddress(): address {
    val storage = lazy VaultStorage.load();
    return storage.core.load().governanceAddress;
}

get fun adapterState(adapterId: uint16): (address, bool, coins) {
    val storage = lazy VaultStorage.load();
    val adapter = storage.adapters.mustGet(adapterId, ERR_INVALID_ADAPTER);
    return (adapter.adapterAddress, adapter.enabled, adapter.maxPerAction);
}

get fun scheduledAction(proposalId: uint64): (uint8, uint16, coins, uint8, coins, uint32, uint32, uint8) {
    val storage = lazy VaultStorage.load();
    val action = storage.scheduledActions.mustGet(proposalId, ERR_NOT_SCHEDULED);
    return (
        action.actionKind,
        action.adapterId,
        action.amount,
        action.policyKey,
        action.policyValue,
        action.executeAfter,
        action.expiresAt,
        action.status
    );
}




