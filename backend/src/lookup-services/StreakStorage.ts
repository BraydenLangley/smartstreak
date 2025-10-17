import { Collection, Db } from 'mongodb'
import { LookupFormula } from '@bsv/overlay'
import { StreakRecord } from '../types.js'

export interface FindTopOptions {
  namespace?: string
  limit?: number
}

export interface FindByCreatorOptions {
  creatorIdentityKey: string
  namespace?: string
}

export interface FindActiveOptions {
  namespace?: string
  dayStamp: number
}

export interface FindBrokenSinceOptions {
  namespace?: string
  referenceDayStamp: number
}

export class StreakStorage {
  private readonly records: Collection<StreakRecord>

  constructor (private readonly db: Db) {
    this.records = db.collection<StreakRecord>('StreakRecords')
    void this.ensureIndexes()
  }

  private async ensureIndexes (): Promise<void> {
    await this.records.createIndex({ creatorIdentityKey: 1, namespace: 1 })
    await this.records.createIndex({ namespace: 1, count: -1 })
    await this.records.createIndex({ creatorIdentityKey: 1, namespace: 1, dayStamp: -1 })
    await this.records.createIndex({ count: -1 })
  }

  async storeRecord (record: Omit<StreakRecord, 'updatedAt'>): Promise<void> {
    await this.records.updateOne(
      {
        creatorIdentityKey: record.creatorIdentityKey,
        namespace: record.namespace
      },
      {
        $set: {
          ...record,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )
  }

  async deleteRecord (txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  async findAll (): Promise<LookupFormula> {
    const records = await this.records.find({}).toArray()
    return records.map(record => ({
      txid: record.txid,
      outputIndex: record.outputIndex
    }))
  }

  async findByCreator ({ creatorIdentityKey, namespace }: FindByCreatorOptions): Promise<LookupFormula> {
    const query: Partial<StreakRecord> = { creatorIdentityKey }
    if (namespace !== undefined) {
      query.namespace = namespace
    }

    const records = await this.records.find(query).toArray()
    return records.map(record => ({ txid: record.txid, outputIndex: record.outputIndex }))
  }

  async findTop ({ namespace, limit = 100 }: FindTopOptions = {}): Promise<LookupFormula> {
    const query: Partial<StreakRecord> = {}
    if (namespace !== undefined) {
      query.namespace = namespace
    }

    const records = await this.records
      .find(query)
      .sort({ count: -1 })
      .limit(limit)
      .toArray()

    return records.map(record => ({ txid: record.txid, outputIndex: record.outputIndex }))
  }

  async findActiveForDate ({ namespace, dayStamp }: FindActiveOptions): Promise<LookupFormula> {
    const query: Partial<StreakRecord> = { dayStamp }
    if (namespace !== undefined) {
      query.namespace = namespace
    }

    const records = await this.records.find(query).toArray()
    return records.map(record => ({ txid: record.txid, outputIndex: record.outputIndex }))
  }

  async findBrokenSince ({ namespace, referenceDayStamp }: FindBrokenSinceOptions): Promise<LookupFormula> {
    const match: any = {
      $expr: {
        $lt: [
          '$dayStamp',
          {
            $subtract: [referenceDayStamp, '$cadenceDays']
          }
        ]
      }
    }

    if (namespace !== undefined) {
      match.namespace = namespace
    }

    const records = await this.records.aggregate<StreakRecord>([
      { $match: match }
    ]).toArray()

    return records.map(record => ({ txid: record.txid, outputIndex: record.outputIndex }))
  }
}
