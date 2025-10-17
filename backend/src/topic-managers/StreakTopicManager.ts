import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { Transaction, ProtoWallet, Utils } from '@bsv/sdk'
import docs from './StreakTopicDocs.md.js'
import streakContractJson from '../../artifacts/Streak.json' with { type: 'json' }
import { StreakContract } from '../contracts/Streak.js'

StreakContract.loadArtifact(streakContractJson)

const anyoneWallet = new ProtoWallet('anyone')

const getTodayStamp = (): number => {
  const today = new Date()
  const yyyy = today.getUTCFullYear()
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(today.getUTCDate()).padStart(2, '0')
  return Number(`${yyyy}${mm}${dd}`)
}

export interface StreakTopicManagerOptions {
  enforceDailyCadence?: boolean
  enforceSingleTickPerDay?: boolean
}

const defaultOptions: Required<StreakTopicManagerOptions> = {
  enforceDailyCadence: true,
  enforceSingleTickPerDay: true
}

export default class StreakTopicManager implements TopicManager {
  constructor (private readonly options: StreakTopicManagerOptions = {}) {}

  async identifyAdmissibleOutputs (
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const outputsToAdmit: number[] = []
    const mergedOptions = { ...defaultOptions, ...this.options }
    const seenForDay = new Set<string>()
    const todayUTC = getTodayStamp()

    try {
      const parsedTransaction = Transaction.fromBEEF(beef)

      for (const [i, output] of parsedTransaction.outputs.entries()) {
        try {
          const script = output.lockingScript.toHex()
          const streak = StreakContract.fromLockingScript(script) as StreakContract

          const verifyResult = await anyoneWallet.verifySignature({
            protocolID: [0, 'streaks'],
            keyID: '1',
            counterparty: streak.creatorIdentityKey,
            data: [1],
            signature: Utils.toArray(streak.creatorSignature, 'hex')
          })

          if (verifyResult.valid !== true) {
            throw new Error('Signature invalid')
          }

          const cadence = Number(streak.cadenceDays)
          const dayStamp = Number(streak.dayStamp)
          const namespace = Utils.toUTF8(
            Utils.toArray(streak.namespace, 'hex')
          )
          const identityKey = Utils.toHex(
            Utils.toArray(streak.creatorIdentityKey, 'hex')
          )

          if (mergedOptions.enforceDailyCadence && cadence === 1) {
            if (dayStamp !== todayUTC) {
              throw new Error('Daily streaks must use today\'s UTC day stamp')
            }
          }

          if (mergedOptions.enforceSingleTickPerDay && cadence === 1) {
            const seenKey = `${identityKey}:${namespace}:${dayStamp}`
            if (seenForDay.has(seenKey)) {
              throw new Error('Duplicate daily tick for identity and namespace')
            }
            seenForDay.add(seenKey)
          }

          outputsToAdmit.push(i)
        } catch (error) {
          continue
        }
      }

      if (outputsToAdmit.length === 0) {
        console.warn('No outputs admitted!')
      }
    } catch (error) {
      const beefStr = JSON.stringify(beef, null, 2)
      throw new Error(
        `topicManager:Error:identifying admissible outputs:${error} beef:${beefStr}}`
      )
    }

    return {
      outputsToAdmit,
      coinsToRetain: previousCoins
    }
  }

  async getDocumentation (): Promise<string> {
    return docs
  }

  async getMetaData (): Promise<{
    name: string
    shortDescription: string
    iconURL?: string
    version?: string
    informationURL?: string
  }> {
    return {
      name: 'Streaks Topic Manager',
      shortDescription: 'Streak tokens with enforced cadence.'
    }
  }
}
