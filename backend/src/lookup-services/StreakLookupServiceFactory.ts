import {
  LookupService,
  LookupQuestion,
  LookupFormula,
  AdmissionMode,
  SpendNotificationMode,
  OutputAdmittedByTopic,
  OutputSpent
} from '@bsv/overlay'
import { Utils } from '@bsv/sdk'
import docs from './StreakLookupDocs.md.js'
import streakContractJson from '../../artifacts/Streak.json' with { type: 'json' }
import { StreakContract } from '../contracts/Streak.js'
import { Db } from 'mongodb'
import {
  StreakStorage,
  FindActiveAtHeightOptions,
  FindBrokenSinceHeightOptions,
  FindByCreatorOptions,
  FindTopOptions
} from './StreakStorage.js'

StreakContract.loadArtifact(streakContractJson)

class StreakLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: StreakStorage) { }

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript, satoshis } = payload
    if (topic !== 'tm_streaks') return

    try {
      const streak = StreakContract.fromLockingScript(
        lockingScript.toHex()
      ) as StreakContract

      const count = Number(streak.count)
      const blockHeight = Number(streak.blockHeight)
      const creatorIdentityKey = Utils.toHex(
        Utils.toArray(streak.creatorIdentityKey, 'hex')
      )
      const namespace = Utils.toUTF8(
        Utils.toArray(streak.namespace, 'hex')
      )
      const cadenceDays = Number(streak.cadenceDays)

      await this.storage.storeRecord({
        txid,
        outputIndex,
        lockingScript: lockingScript.toHex(),
        satoshis,
        count,
        blockHeight,
        creatorIdentityKey,
        namespace,
        cadenceDays
      })
    } catch (error) {
      console.error('Error indexing streak token', error)
    }
  }

  async outputSpent?(payload: OutputSpent): Promise<void> {
    if (payload.mode !== 'none') throw new Error('Invalid payload')
    const { topic, txid, outputIndex } = payload
    if (topic !== 'tm_streaks') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async outputEvicted(txid: string, outputIndex: number): Promise<void> {
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async lookup(question: LookupQuestion): Promise<LookupFormula> {
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_streaks') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as any

    if (query.findAll) {
      return await this.storage.findAll()
    }

    if (query.findByCreator) {
      const options: FindByCreatorOptions = {
        creatorIdentityKey: query.findByCreator.creatorIdentityKey,
        namespace: query.findByCreator.namespace
      }
      return await this.storage.findByCreator(options)
    }

    if (query.findTop) {
      const options: FindTopOptions = {
        namespace: query.findTop.namespace,
        limit: query.findTop.limit
      }
      return await this.storage.findTop(options)
    }

    if (query.findActiveAtHeight) {
      const options: FindActiveAtHeightOptions = {
        namespace: query.findActiveAtHeight.namespace,
        blockHeight: query.findActiveAtHeight.blockHeight
      }
      return await this.storage.findActiveAtHeight(options)
    }

    if (query.findBrokenSinceHeight) {
      const options: FindBrokenSinceHeightOptions = {
        namespace: query.findBrokenSinceHeight.namespace,
        referenceBlockHeight: query.findBrokenSinceHeight.referenceBlockHeight
      }
      return await this.storage.findBrokenSinceHeight(options)
    }

    const mess = JSON.stringify(question, null, 2)
    throw new Error(`Unsupported query:${mess}`)
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Streaks Lookup Service',
      shortDescription: 'Track streak progress by namespace and identity.'
    }
  }
}

export default (db: Db): StreakLookupService => {
  return new StreakLookupService(new StreakStorage(db))
}
