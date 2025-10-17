import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  SmartContract,
  SigHash
} from 'scrypt-ts'

export class StreakContract extends SmartContract {
  @prop(true)
  count: bigint

  @prop(true)
  dayStamp: bigint

  @prop(true)
  creatorIdentityKey: ByteString

  @prop(true)
  creatorSignature: ByteString

  @prop(true)
  namespace: ByteString

  @prop(true)
  cadenceDays: bigint

  constructor (
    count: bigint,
    dayStamp: bigint,
    creatorIdentityKey: ByteString,
    creatorSignature: ByteString,
    namespace: ByteString,
    cadenceDays: bigint
  ) {
    super(...arguments)
    this.count = count
    this.dayStamp = dayStamp
    this.creatorIdentityKey = creatorIdentityKey
    this.creatorSignature = creatorSignature
    this.namespace = namespace
    this.cadenceDays = cadenceDays
  }

  @method(SigHash.ANYONECANPAY_SINGLE)
  public advanceOnChain (nextDayStamp: bigint) {
    this.advance(nextDayStamp)

    const amount: bigint = this.ctx.utxo.value
    const outputs: ByteString = this.buildStateOutput(amount)
    assert(this.ctx.hashOutputs == hash256(outputs), 'hashOutputs mismatch')
  }

  @method()
  advance (nextDayStamp: bigint): void {
    const expectedNext: bigint = this.dayStamp + this.cadenceDays
    assert(
      nextDayStamp == expectedNext,
      'next day must equal previous day plus cadence'
    )

    this.count++
    this.dayStamp = nextDayStamp
  }
}
