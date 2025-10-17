declare module 'react-toastify'

export interface Token {
  atomicBeefTX: HexString
  txid: TXIDHexString
  outputIndex: PositiveIntegerOrZero
  lockingScript: HexString
  satoshis: SatoshiValue
}

export interface Streak {
  count: number
  dayStamp: number
  cadenceDays: number
  namespace: string
  creatorIdentityKey: PubKeyHex
  token: Token
}
