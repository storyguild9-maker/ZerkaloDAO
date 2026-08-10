tolk 1.4.2

const ACTION_ALLOCATE = 1
const ACTION_WITHDRAW = 2
const ACTION_SET_POLICY = 3
const ACTION_PAUSE = 4
const ACTION_UNPAUSE = 5

const PROPOSAL_ACTIVE = 1
const PROPOSAL_ACCEPTED_PENDING = 2
const PROPOSAL_REJECTED = 3
const PROPOSAL_SCHEDULED = 4
const PROPOSAL_EXECUTED = 5

const VOTE_YES = 1
const VOTE_NO = 2
const VOTE_ABSTAIN = 3

const MIN_QUORUM_BPS = 6000
const MIN_APPROVAL_BPS = 6667
const POLICY_APPROVAL_BPS = 7500

const ERR_UNAUTHORIZED = 200
const ERR_ACTIVE_PROPOSAL = 201
const ERR_PENDING_DEPOSIT = 202
const ERR_NO_STAKE = 203
const ERR_INVALID_ACTION = 204
const ERR_NOT_ACTIVE = 205
const ERR_ALREADY_VOTED = 206
const ERR_VOTING_CLOSED = 207
const ERR_VOTING_OPEN = 208
const ERR_BAD_STATUS = 209
const ERR_BAD_VALUE = 210

struct Proposal {
    proposer: address
    actionKind: uint8
    adapterId: uint16
    amount: coins
    policyKey: uint8
    policyValue: coins
    createdAt: uint32
    voteEndsAt: uint32
    snapshotTotalShares: coins
    yesVotes: coins
    noVotes: coins
    abstainVotes: coins
    executeAfter: uint32
    expiresAt: uint32
    status: uint8
}

struct GovernanceStorage {
    vaultAddress: address
    minProposalStake: coins
    quorumBps: uint16
    approvalBps: uint16
    votingPeriod: uint32
    activeProposalId: uint64
    nextProposalId: uint64
    pendingDepositCount: uint32
    totalShares: coins
    shares: map<address, coins>
    proposals: map<uint64, Proposal>
    votes: map<uint256, uint8>
}

fun GovernanceStorage.load() {
    return GovernanceStorage.fromCell(contract.getData())
}

fun GovernanceStorage.save(self) {
    contract.setData(self.toCell())
}

struct (0x6f11a001) Contribute {
    queryId: uint64
}

struct (0x6f11a002) CreateProposal {
    queryId: uint64
    actionKind: uint8
    adapterId: uint16
    amount: coins
    policyKey: uint8
    policyValue: coins
}

struct (0x6f11a003) CastVote {
    queryId: uint64
    proposalId: uint64
    choice: uint8
}

struct (0x6f11a004) FinalizeProposal {
    queryId: uint64
    proposalId: uint64
}

struct (0x6f11a005) RetrySchedule {
    queryId: uint64
    proposalId: uint64
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

type AllowedMessage = Contribute | CreateProposal | CastVote | FinalizeProposal | RetrySchedule | DepositAccepted | ActionScheduled | ActionExecuted

fun voteKey(proposalId: uint64, voter: address): uint256 {
    return beginCell().storeUint(proposalId, 64).storeAddress(voter).endCell().hash();
}

fun validateActionShape(actionKind: uint8, adapterId: uint16, amount: coins, policyKey: uint8, policyValue: coins) {
    if (actionKind == ACTION_ALLOCATE || actionKind == ACTION_WITHDRAW) {
        assert (adapterId > 0 && amount > 0 && policyKey == 0 && policyValue == 0) throw ERR_INVALID_ACTION;
        return;
    }
    if (actionKind == ACTION_SET_POLICY) {
        assert (adapterId == 0 && amount == 0 && policyKey >= 1 && policyKey <= 4) throw ERR_INVALID_ACTION;
        return;
    }
    if (actionKind == ACTION_PAUSE || actionKind == ACTION_UNPAUSE) {
        assert (adapterId == 0 && amount == 0 && policyKey == 0 && policyValue == 0) throw ERR_INVALID_ACTION;
        return;
    }
    throw ERR_INVALID_ACTION;
}

fun sendSchedule(storage: GovernanceStorage, queryId: uint64, proposalId: uint64, proposal: Proposal) {
    createMessage({
        bounce: BounceMode.RichBounce,
        value: grams("0.05"),
        dest: storage.vaultAddress,
        body: ScheduleAction {
            queryId,
            proposalId,
            actionKind: proposal.actionKind,
            adapterId: proposal.adapterId,
            amount: proposal.amount,
            policyKey: proposal.policyKey,
            policyValue: proposal.policyValue,
        }
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);
    var storage = lazy GovernanceStorage.load();

    match (msg) {
        Contribute => {
            assert (storage.activeProposalId == 0) throw ERR_ACTIVE_PROPOSAL;
            assert (in.valueCoins >= grams("0.2")) throw ERR_BAD_VALUE;
            val contribution = in.valueCoins - grams("0.1");
            storage.pendingDepositCount += 1;
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: contribution,
                dest: storage.vaultAddress,
                body: VaultDeposit {
                    queryId: msg.queryId,
                    memberAddress: in.senderAddress,
                    amount: contribution,
                }
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        DepositAccepted => {
            assert (in.senderAddress == storage.vaultAddress) throw ERR_UNAUTHORIZED;
            assert (storage.pendingDepositCount > 0 && msg.amount > 0) throw ERR_BAD_VALUE;
            val previous = storage.shares.get(msg.memberAddress);
            val oldShares = previous.isFound ? previous.loadValue() : (0 as coins);
            storage.shares.set(msg.memberAddress, oldShares + msg.amount);
            storage.totalShares += msg.amount;
            storage.pendingDepositCount -= 1;
            storage.save();
        }

        CreateProposal => {
            assert (storage.activeProposalId == 0) throw ERR_ACTIVE_PROPOSAL;
            assert (storage.pendingDepositCount == 0) throw ERR_PENDING_DEPOSIT;
            validateActionShape(msg.actionKind, msg.adapterId, msg.amount, msg.policyKey, msg.policyValue);
            val proposerShares = storage.shares.mustGet(in.senderAddress, ERR_NO_STAKE);
            assert (proposerShares >= storage.minProposalStake) throw ERR_NO_STAKE;

            val proposalId = storage.nextProposalId;
            val proposal: Proposal = {
                proposer: in.senderAddress,
                actionKind: msg.actionKind,
                adapterId: msg.adapterId,
                amount: msg.amount,
                policyKey: msg.policyKey,
                policyValue: msg.policyValue,
                createdAt: blockchain.now() as uint32,
                voteEndsAt: (blockchain.now() + storage.votingPeriod) as uint32,
                snapshotTotalShares: storage.totalShares,
                yesVotes: proposerShares,
                noVotes: 0,
                abstainVotes: 0,
                executeAfter: 0,
                expiresAt: 0,
                status: PROPOSAL_ACTIVE,
            };
            storage.proposals.set(proposalId, proposal);
            storage.votes.set(voteKey(proposalId, in.senderAddress), VOTE_YES);
            storage.activeProposalId = proposalId;
            storage.nextProposalId += 1;
            storage.save();
        }

        CastVote => {
            assert (storage.activeProposalId == msg.proposalId) throw ERR_NOT_ACTIVE;
            var proposal = storage.proposals.mustGet(msg.proposalId, ERR_NOT_ACTIVE);
            assert (proposal.status == PROPOSAL_ACTIVE) throw ERR_NOT_ACTIVE;
            assert (blockchain.now() <= proposal.voteEndsAt) throw ERR_VOTING_CLOSED;
            assert (msg.choice >= VOTE_YES && msg.choice <= VOTE_ABSTAIN) throw ERR_BAD_VALUE;
            val weight = storage.shares.mustGet(in.senderAddress, ERR_NO_STAKE);
            val key = voteKey(msg.proposalId, in.senderAddress);
            assert (!storage.votes.exists(key)) throw ERR_ALREADY_VOTED;
            storage.votes.set(key, msg.choice);
            if (msg.choice == VOTE_YES) {
                proposal.yesVotes += weight;
            } else if (msg.choice == VOTE_NO) {
                proposal.noVotes += weight;
            } else {
                proposal.abstainVotes += weight;
            }
            storage.proposals.set(msg.proposalId, proposal);
            storage.save();
        }

        FinalizeProposal => {
            assert (storage.activeProposalId == msg.proposalId) throw ERR_NOT_ACTIVE;
            var proposal = storage.proposals.mustGet(msg.proposalId, ERR_NOT_ACTIVE);
            assert (proposal.status == PROPOSAL_ACTIVE) throw ERR_NOT_ACTIVE;
            assert (blockchain.now() > proposal.voteEndsAt) throw ERR_VOTING_OPEN;

            val totalCast = proposal.yesVotes + proposal.noVotes + proposal.abstainVotes;
            val decisiveVotes = proposal.yesVotes + proposal.noVotes;
            val quorumBps = max(storage.quorumBps, MIN_QUORUM_BPS);
            var approvalBps = max(storage.approvalBps, MIN_APPROVAL_BPS);
            if (proposal.actionKind == ACTION_SET_POLICY || proposal.actionKind == ACTION_UNPAUSE) {
                approvalBps = max(approvalBps, POLICY_APPROVAL_BPS);
            }
            val hasQuorum = totalCast * 10000 >= proposal.snapshotTotalShares * quorumBps;
            val isApproved = decisiveVotes > 0 && proposal.yesVotes * 10000 >= decisiveVotes * approvalBps;
            storage.activeProposalId = 0;
            if (hasQuorum && isApproved) {
                proposal.status = PROPOSAL_ACCEPTED_PENDING;
                storage.proposals.set(msg.proposalId, proposal);
                storage.save();
                sendSchedule(storage, msg.queryId, msg.proposalId, proposal);
            } else {
                proposal.status = PROPOSAL_REJECTED;
                storage.proposals.set(msg.proposalId, proposal);
                storage.save();
            }
        }

        RetrySchedule => {
            val proposal = storage.proposals.mustGet(msg.proposalId, ERR_BAD_STATUS);
            assert (proposal.status == PROPOSAL_ACCEPTED_PENDING) throw ERR_BAD_STATUS;
            sendSchedule(storage, msg.queryId, msg.proposalId, proposal);
        }

        ActionScheduled => {
            assert (in.senderAddress == storage.vaultAddress) throw ERR_UNAUTHORIZED;
            var proposal = storage.proposals.mustGet(msg.proposalId, ERR_BAD_STATUS);
            assert (proposal.status == PROPOSAL_ACCEPTED_PENDING || proposal.status == PROPOSAL_SCHEDULED) throw ERR_BAD_STATUS;
            proposal.executeAfter = msg.executeAfter;
            proposal.expiresAt = msg.expiresAt;
            proposal.status = PROPOSAL_SCHEDULED;
            storage.proposals.set(msg.proposalId, proposal);
            storage.save();
        }

        ActionExecuted => {
            assert (in.senderAddress == storage.vaultAddress) throw ERR_UNAUTHORIZED;
            var proposal = storage.proposals.mustGet(msg.proposalId, ERR_BAD_STATUS);
            assert (proposal.status == PROPOSAL_SCHEDULED) throw ERR_BAD_STATUS;
            assert (proposal.actionKind == msg.actionKind) throw ERR_INVALID_ACTION;
            proposal.status = PROPOSAL_EXECUTED;
            storage.proposals.set(msg.proposalId, proposal);
            storage.save();
        }

        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    var storage = lazy GovernanceStorage.load();
    if (in.senderAddress != storage.vaultAddress || storage.pendingDepositCount == 0) {
        return;
    }
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val original = lazy VaultDeposit.fromCell(rich.originalBody);
    if (original.amount > 0) {
        storage.pendingDepositCount -= 1;
        storage.save();
    }
}

get fun governanceState(): (coins, coins, uint16, uint16, uint32, uint64, uint64, uint32) {
    val storage = lazy GovernanceStorage.load();
    return (
        storage.totalShares,
        storage.minProposalStake,
        max(storage.quorumBps, MIN_QUORUM_BPS) as uint16,
        max(storage.approvalBps, MIN_APPROVAL_BPS) as uint16,
        storage.votingPeriod,
        storage.activeProposalId,
        storage.nextProposalId,
        storage.pendingDepositCount
    );
}

get fun memberShares(memberAddress: address): coins {
    val storage = lazy GovernanceStorage.load();
    val result = storage.shares.get(memberAddress);
    return result.isFound ? result.loadValue() : (0 as coins);
}

get fun proposalState(proposalId: uint64): (address, uint8, uint16, coins, uint8, coins, uint32, uint32, coins, coins, coins, coins, uint32, uint32, uint8) {
    val storage = lazy GovernanceStorage.load();
    val proposal = storage.proposals.mustGet(proposalId, ERR_NOT_ACTIVE);
    return (
        proposal.proposer,
        proposal.actionKind,
        proposal.adapterId,
        proposal.amount,
        proposal.policyKey,
        proposal.policyValue,
        proposal.createdAt,
        proposal.voteEndsAt,
        proposal.snapshotTotalShares,
        proposal.yesVotes,
        proposal.noVotes,
        proposal.abstainVotes,
        proposal.executeAfter,
        proposal.expiresAt,
        proposal.status
    );
}

get fun memberVote(proposalId: uint64, memberAddress: address): uint8 {
    val storage = lazy GovernanceStorage.load();
    val result = storage.votes.get(voteKey(proposalId, memberAddress));
    return result.isFound ? result.loadValue() : 0;
}


