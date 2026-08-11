tolk 1.4.2

import "@stdlib/gas-payments"

const CLAIM_DOMAIN = 0x5a475231
const ERR_BAD_MESSAGE = 400
const ERR_BAD_DOMAIN = 401
const ERR_EXPIRED = 402
const ERR_WRONG_CONTRACT = 403
const ERR_WRONG_WORKCHAIN = 404
const ERR_BAD_SIGNATURE = 405
const ERR_SUBJECT_CLAIMED = 406
const ERR_WALLET_CLAIMED = 407
const ERR_INSUFFICIENT_BALANCE = 408

struct DistributorStorage {
    authorizerPublicKey: uint256
    claimAmount: coins
    minReserve: coins
    issuedCount: uint64
    claimedSubjects: map<uint256, uint8>
    claimedWallets: map<uint256, uint8>
}

fun DistributorStorage.load() {
    return DistributorStorage.fromCell(contract.getData())
}

fun DistributorStorage.save(self) {
    contract.setData(self.toCell())
}

struct ClaimVoucher {
    domain: uint32
    validUntil: uint32
    distributorAddress: address
    recipientAddress: address
    subjectHash: uint256
}

fun onInternalMessage(in: InMessage) {
    // The contract is topped up with an ordinary empty internal transfer.
    assert (in.body.isEmpty()) throw ERR_BAD_MESSAGE;
}

fun onExternalMessage(inMsgBody: slice) {
    var storage = lazy DistributorStorage.load();
    assert (inMsgBody.remainingBitsCount() >= 512 && inMsgBody.remainingRefsCount() == 1) throw ERR_BAD_MESSAGE;

    val signature = inMsgBody.loadBits(512);
    val signedData = inMsgBody.loadRef();
    inMsgBody.assertEnd();
    val voucher = lazy ClaimVoucher.fromCell(signedData);

    assert (voucher.domain == CLAIM_DOMAIN) throw ERR_BAD_DOMAIN;
    assert (voucher.validUntil > blockchain.now()) throw ERR_EXPIRED;
    assert (voucher.distributorAddress == contract.getAddress()) throw ERR_WRONG_CONTRACT;
    val (recipientWorkchain, walletHash) = voucher.recipientAddress.getWorkchainAndHash();
    assert (recipientWorkchain == 0) throw ERR_WRONG_WORKCHAIN;
    assert (isSignatureValid(signedData.hash(), signature, storage.authorizerPublicKey)) throw ERR_BAD_SIGNATURE;
    assert (!storage.claimedSubjects.exists(voucher.subjectHash)) throw ERR_SUBJECT_CLAIMED;
    assert (!storage.claimedWallets.exists(walletHash)) throw ERR_WALLET_CLAIMED;
    assert (
        contract.getOriginalBalance() >= storage.claimAmount + storage.minReserve + grams("0.05")
    ) throw ERR_INSUFFICIENT_BALANCE;

    acceptExternalMessage();
    storage.claimedSubjects.set(voucher.subjectHash, 1);
    storage.claimedWallets.set(walletHash, 1);
    storage.issuedCount += 1;
    storage.save();

    createMessage({
        bounce: BounceMode.NoBounce,
        value: storage.claimAmount,
        dest: voucher.recipientAddress,
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

get fun distributorState(): (uint256, coins, coins, uint64) {
    val storage = lazy DistributorStorage.load();
    return (
        storage.authorizerPublicKey,
        storage.claimAmount,
        storage.minReserve,
        storage.issuedCount,
    );
}

get fun claimStatus(subjectHash: uint256, recipientAddress: address): (bool, bool) {
    val storage = lazy DistributorStorage.load();
    val (_, walletHash) = recipientAddress.getWorkchainAndHash();
    return (
        storage.claimedSubjects.exists(subjectHash),
        storage.claimedWallets.exists(walletHash),
    );
}
