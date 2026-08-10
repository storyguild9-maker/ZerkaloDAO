tolk 1.4.2

const ERR_UNAUTHORIZED = 300
const ERR_INSUFFICIENT_PRINCIPAL = 301
const ERR_INSUFFICIENT_BALANCE = 302

struct AdapterStorage {
    vaultAddress: address
    adapterId: uint16
    principal: coins
}

fun AdapterStorage.load() {
    return AdapterStorage.fromCell(contract.getData())
}

fun AdapterStorage.save(self) {
    contract.setData(self.toCell())
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

struct (0x7a11a001) AddTestYield {
    queryId: uint64
}

struct (0x5a11a008) AdapterReceipt {
    queryId: uint64
    proposalId: uint64
    adapterId: uint16
    actionKind: uint8
    amount: coins
}

struct (0x5a11a007) AdapterReturn {
    queryId: uint64
    proposalId: uint64
    adapterId: uint16
    amount: coins
}

type AllowedMessage = AdapterAllocate | AdapterWithdraw | AddTestYield

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);
    var storage = lazy AdapterStorage.load();

    match (msg) {
        AdapterAllocate => {
            assert (in.senderAddress == storage.vaultAddress) throw ERR_UNAUTHORIZED;
            storage.principal += in.valueCoins;
            storage.save();
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.01"),
                dest: storage.vaultAddress,
                body: AdapterReceipt {
                    queryId: msg.queryId,
                    proposalId: msg.proposalId,
                    adapterId: storage.adapterId,
                    actionKind: 1,
                    amount: in.valueCoins,
                }
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        AdapterWithdraw => {
            assert (in.senderAddress == storage.vaultAddress) throw ERR_UNAUTHORIZED;
            assert (msg.adapterId == storage.adapterId) throw ERR_UNAUTHORIZED;
            assert (msg.amount <= storage.principal) throw ERR_INSUFFICIENT_PRINCIPAL;
            assert (contract.getOriginalBalance() >= msg.amount + grams("0.05")) throw ERR_INSUFFICIENT_BALANCE;
            storage.principal -= msg.amount;
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: msg.amount,
                dest: storage.vaultAddress,
                body: AdapterReturn {
                    queryId: msg.queryId,
                    proposalId: msg.proposalId,
                    adapterId: storage.adapterId,
                    amount: msg.amount,
                }
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }

        AddTestYield => {
            // Test-only top-up: attached value becomes simulated yield and never mints voting weight.
        }

        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
}

get fun adapterState(): (address, uint16, coins) {
    val storage = lazy AdapterStorage.load();
    return (storage.vaultAddress, storage.adapterId, storage.principal);
}


