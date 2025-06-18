import {
  LookupService,
  LookupQuestion,
  LookupAnswer,
  LookupFormula,
  AdmissionMode,
  SpendNotificationMode,
  OutputAdmittedByTopic,
  OutputSpent
} from '@bsv/overlay'
import { MeterStorage } from './MeterStorage.js'
import { Script, Utils } from '@bsv/sdk'
import docs from './MeterLookupDocs.md.js'
import meterContractJson from '../../artifacts/Meter.json' with { type: 'json' }
import { MeterContract } from '../contracts/Meter.js'
import { Db } from 'mongodb'
MeterContract.loadArtifact(meterContractJson)

/**
 * Implements a Meter lookup service
 *
 * Note: The sCrypt contract is used to decode Meter tokens.
 *
 * @public
 */
class MeterLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  /**
   * Constructs a new MeterLookupService instance
   * @param storage - The storage instance to use for managing records
   */
  constructor(public storage: MeterStorage) { }

  /**
   * Notifies the lookup service of a new output added.
   *
   * @param {OutputAdmittedByTopic} payload - The payload of the output to be processed.
   *
   * @returns {Promise<void>} A promise that resolves when the processing is complete.
   * @throws Will throw an error if there is an issue with storing the record in the storage engine.
   */
  async outputAdmittedByTopic(
    payload: OutputAdmittedByTopic
  ): Promise<void> {
    if (payload.mode !== 'locking-script') throw new Error('Invalid payload')
    const { txid, outputIndex, topic, lockingScript } = payload
    if (topic !== 'tm_meter') return
    try {
      // Decode the Meter token fields from the Bitcoin outputScript with the contract class
      const meter = MeterContract.fromLockingScript(
        lockingScript.toHex()
      ) as MeterContract

      // Parse out the message field
      const value = Number(meter.count)
      const creatorIdentityKey = Utils.toHex(
        Utils.toArray(meter.creatorIdentityKey, 'utf8')
      )

      // Store the token fields for future lookup
      await this.storage.storeRecord(
        txid,
        outputIndex,
        value,
        creatorIdentityKey
      )
    } catch (e) {
      console.error('Error indexing token in lookup database', e)
      return
    }
  }

  /**
   * Notifies the lookup service that an output was spent
   * @param payload - The payload of the output to be processed.
   */
  async outputSpent?(
    payload: OutputSpent
  ): Promise<void> {
    if (payload.mode !== 'none') throw new Error('Invalid payload')
    const { topic, txid, outputIndex } = payload
    if (topic !== 'tm_meter') return
    await this.storage.deleteRecord(txid, outputIndex)
  }

  /**
   * Notifies the lookup service that an output has been deleted
   * @param txid - The transaction ID of the deleted output
   * @param outputIndex - The index of the deleted output
   */
  async outputEvicted(
    txid: string, outputIndex: number
  ): Promise<void> {
    await this.storage.deleteRecord(txid, outputIndex)
  }

  /**
   * Answers a lookup query
   * @param question - The lookup question to be answered
   * @returns A promise that resolves to a lookup answer or formula
   */
  async lookup(
    question: LookupQuestion
  ): Promise<LookupFormula> {
    if (question.query === undefined || question.query === null) {
      throw new Error('A valid query must be provided!')
    }
    if (question.service !== 'ls_meter') {
      throw new Error('Lookup service not supported!')
    }

    const query = question.query as {
      txid?: string
      creatorIdentityKey?: string
      findAll?: boolean
    }
    if (query.findAll) {
      return await this.storage.findAll()
    }
    const mess = JSON.stringify(question, null, 2)
    throw new Error(`question.query:${mess}}`)
  }

  /**
   * Returns documentation specific to this overlay lookup service
   * @returns A promise that resolves to the documentation string
   */
  async getDocumentation(): Promise<string> {
    return docs
  }

  /**
   * Returns metadata associated with this lookup service
   * @returns A promise that resolves to an object containing metadata
   * @throws An error indicating the method is not implemented
   */
  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Meter Lookup Service',
      shortDescription: 'Meters, up and down.'
    }
  }
}

// Factory function
export default (db: Db): MeterLookupService => {
  return new MeterLookupService(new MeterStorage(db))
}
