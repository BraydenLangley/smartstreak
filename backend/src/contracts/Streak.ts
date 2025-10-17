import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  SmartContract,
  SigHash,
  Sig,
  PubKey
} from 'scrypt-ts'

export class StreakContract extends SmartContract {
  @prop(true)
  count: bigint

  @prop(true)
  creatorIdentityKey: ByteString

  @prop(true)
  creatorSignature: ByteString

  @prop(true)
  namespace: ByteString

  @prop(true)
  cadenceDays: bigint

  @prop(true)
  blockHeight: bigint

  constructor(
    count: bigint,
    blockHeight: bigint,
    creatorIdentityKey: ByteString,
    creatorSignature: ByteString,
    namespace: ByteString,
    cadenceDays: bigint
  ) {
    super(...arguments)
    this.count = count
    this.blockHeight = blockHeight
    this.creatorIdentityKey = creatorIdentityKey
    this.creatorSignature = creatorSignature
    this.namespace = namespace
    this.cadenceDays = cadenceDays
  }

  @method(SigHash.ANYONECANPAY_SINGLE)
  public advanceOnChain(sig: Sig, pubKey: PubKey) {
    this.advance(sig, pubKey)

    const amount: bigint = this.ctx.utxo.value
    const outputs: ByteString = this.buildStateOutput(amount)
    assert(this.ctx.hashOutputs == hash256(outputs), 'hashOutputs mismatch')
  }

  @method()
  advance(sig: Sig, pubKey: PubKey): void {
    // Verify creator signature (like Locksmith pattern)
    assert(
      PubKey(this.creatorIdentityKey) == pubKey,
      'pubKey does not match creator identity'
    )
    assert(this.checkSig(sig, pubKey), 'creator signature check failed')

    // Use blockHeight locktime to prevent backdating
    assert(this.ctx.locktime < 500000000n, 'must use blockHeight locktime')
    assert(
      this.ctx.sequence == 0xfffffffen,
      'must use sequence locktime'
    )

    assert(
      this.ctx.locktime >= this.blockHeight + (this.cadenceDays * 144n),
      'cannot advance streak before the actual day'
    )

    this.count++
    this.blockHeight += (this.cadenceDays * 144n)
  }

  @method(SigHash.ANYONECANPAY_SINGLE)
  public terminateOnChain() {
    this.terminate()

    const amount: bigint = this.ctx.utxo.value
    const outputs: ByteString = this.buildStateOutput(amount)
    assert(this.ctx.hashOutputs == hash256(outputs), 'hashOutputs mismatch')
  }

  @method()
  terminate(): void {
    // Use blockHeight locktime to ensure enough time has passed
    assert(this.ctx.locktime < 500000000n, 'must use blockHeight locktime')
    assert(
      this.ctx.sequence == 0xfffffffen,
      'must use sequence locktime'
    )

    // Calculate when this streak should have been advanced
    const expectedAdvanceDay = this.blockHeight + (this.cadenceDays * 144n)

    // Allow termination if we're past the grace period (1 day = ~144 blocks)
    const graceBlocks = 144n
    const terminationHeight = expectedAdvanceDay + graceBlocks

    assert(
      this.ctx.locktime >= terminationHeight,
      'cannot terminate until grace period has passed'
    )

    // Mark as terminated by setting count to 0
    this.count = 0n
  }
}
