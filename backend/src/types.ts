export interface StreakRecord {
  txid: string
  outputIndex: number
  lockingScript: string
  satoshis: number
  count: number
  dayStamp: number
  creatorIdentityKey: string
  namespace: string
  cadenceDays: number
  updatedAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}
