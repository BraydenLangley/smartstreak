import React, { FormEvent, useState } from 'react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  AppBar,
  Toolbar,
  List,
  ListItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Fab,
  LinearProgress,
  Typography,
  IconButton,
  Grid,
  TextField,
  Card,
  CardContent,
  Stack
} from '@mui/material'
import { styled } from '@mui/system'
import AddIcon from '@mui/icons-material/Add'
import GitHubIcon from '@mui/icons-material/GitHub'
import useAsyncEffect from 'use-async-effect'
import { Streak, Token } from './types/types'
import { StreakContract, StreakArtifact } from '@bsv/backend'
import {
  SHIPBroadcaster,
  LookupResolver,
  Transaction,
  Utils,
  ProtoWallet,
  WalletClient,
  SHIPBroadcasterConfig,
  HTTPSOverlayBroadcastFacilitator
} from '@bsv/sdk'
import { bsv, toByteString } from 'scrypt-ts'
import { CreateActionArgs } from '@bsv/sdk'

StreakContract.loadArtifact(StreakArtifact)

const anyoneWallet = new ProtoWallet('anyone')
const walletClient = new WalletClient()

// Network configuration - easily switch between 'local' (for lars) and 'mainnet'
// Change this value to switch networks:
// - 'local' for development with lars
// - 'mainnet' for production
const NETWORK_PRESET: 'local' | 'mainnet' = 'mainnet'

const AppBarPlaceholder = styled('div')({
  height: '4em'
})

const NoItems = styled(Grid)({
  margin: 'auto',
  textAlign: 'center',
  marginTop: '5em'
})

const AddMoreFab = styled(Fab)({
  position: 'fixed',
  right: '1em',
  bottom: '1em',
  zIndex: 10
})

const LoadingBar = styled(LinearProgress)({
  margin: '1em'
})

const GitHubIconStyle = styled(IconButton)({
  color: '#ffffff'
})

const getTodayStamp = (): number => {
  return Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''))
}

const formatDayStamp = (dayStamp: number): string => {
  const dayString = dayStamp.toString().padStart(8, '0')
  const year = Number(dayString.slice(0, 4))
  const month = Number(dayString.slice(4, 6)) - 1
  const day = Number(dayString.slice(6, 8))
  const date = new Date(Date.UTC(year, month, day))
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  })
}

const App: React.FC = () => {
  const [createOpen, setCreateOpen] = useState<boolean>(false)
  const [createLoading, setCreateLoading] = useState<boolean>(false)
  const [streaksLoading, setStreaksLoading] = useState<boolean>(true)
  const [streaks, setStreaks] = useState<Streak[]>([])
  const [namespace, setNamespace] = useState<string>('appaday')
  const [cadenceDays, setCadenceDays] = useState<string>('1')
  const [advancingIndex, setAdvancingIndex] = useState<number | null>(null)
  const [currentUserIdentityKey, setCurrentUserIdentityKey] = useState<string | null>(null)

  const getCurrentUserIdentityKey = async (): Promise<void> => {
    try {
      const publicKey = (await walletClient.getPublicKey({ identityKey: true })).publicKey
      setCurrentUserIdentityKey(publicKey)
    } catch (error) {
      console.error('Failed to get current user identity key:', error)
    }
  }

  const refreshStreaks = async (): Promise<void> => {
    setStreaksLoading(true)
    try {
      const resolver = new LookupResolver({
        networkPreset: NETWORK_PRESET
      })
      const lookupResult = await resolver.query({
        service: 'ls_streaks',
        query: { findAll: true }
      })

      if (!lookupResult || lookupResult.type !== 'output-list') {
        throw new Error('Unexpected lookup response')
      }

      if (!lookupResult.outputs) {
        setStreaks([])
        return
      }

      const parsedResults: Streak[] = []

      for (const result of lookupResult.outputs) {
        try {
          const tx = Transaction.fromBEEF(result.beef)
          const outputIndex = Number(result.outputIndex)
          const script = tx.outputs[outputIndex].lockingScript.toHex()
          const streak = StreakContract.fromLockingScript(script) as StreakContract

          const verifyResult = await anyoneWallet.verifySignature({
            protocolID: [0, 'streaks'],
            keyID: '1',
            counterparty: streak.creatorIdentityKey,
            data: [1],
            signature: Utils.toArray(streak.creatorSignature, 'hex')
          })

          if (!verifyResult.valid) {
            throw new Error('Signature invalid')
          }

          const namespaceBytes = Utils.toArray(streak.namespace, 'hex')
          const namespaceString = Utils.toUTF8(namespaceBytes)
          const identityKeyHex = Utils.toHex(
            Utils.toArray(streak.creatorIdentityKey, 'hex')
          )

          parsedResults.push({
            count: Number(streak.count),
            dayStamp: Number(streak.dayStamp),
            cadenceDays: Number(streak.cadenceDays),
            namespace: namespaceString,
            creatorIdentityKey: identityKeyHex,
            token: {
              atomicBeefTX: Utils.toHex(tx.toAtomicBEEF()),
              txid: tx.id('hex'),
              outputIndex: result.outputIndex,
              lockingScript: script,
              satoshis: tx.outputs[outputIndex].satoshis as number
            } as Token
          })
        } catch (error) {
          console.error('Failed to parse streak output:', error)
        }
      }

      setStreaks(parsedResults)
    } catch (error) {
      console.error('Failed to load streaks:', error)
      toast.error('Unable to load streaks from the overlay')
    } finally {
      setStreaksLoading(false)
    }
  }

  useAsyncEffect(() => {
    getCurrentUserIdentityKey()
    refreshStreaks()
  }, [])

  const handleCreateSubmit = async (
    e: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault()
    try {
      if (!namespace.trim()) {
        throw new Error('Namespace is required')
      }

      const cadence = Number(cadenceDays)
      if (!Number.isInteger(cadence) || cadence < 1) {
        throw new Error('Cadence must be a positive integer')
      }

      setCreateLoading(true)
      // Using configurable network preset
      const network = { network: NETWORK_PRESET }
      const publicKey = (await walletClient.getPublicKey({ identityKey: true }))
        .publicKey

      const signature = Utils.toHex(
        (
          await walletClient.createSignature({
            data: [1],
            protocolID: [0, 'streaks'],
            keyID: '1',
            counterparty: 'anyone'
          })
        ).signature
      )

      const newStreak = new StreakContract(
        BigInt(1),
        BigInt(getTodayStamp()),
        toByteString(publicKey, false),
        toByteString(signature, false),
        toByteString(namespace.trim(), true),
        BigInt(cadence)
      )
      const lockingScript = newStreak.lockingScript.toHex()

      const action = await walletClient.createAction({
        description: `Start ${namespace.trim()} streak`,
        outputs: [
          {
            basket: 'streak tokens',
            lockingScript,
            satoshis: 1,
            outputDescription: 'Streak token'
          }
        ],
        options: { randomizeOutputs: false }
      })

      if (!action.tx) {
        throw new Error('Transaction is undefined')
      }

      const transaction = Transaction.fromAtomicBEEF(action.tx)
      const txid = transaction.id('hex')

      const broadcaster = new SHIPBroadcaster(['tm_streaks'], {
        networkPreset: NETWORK_PRESET
      } satisfies SHIPBroadcasterConfig)

      const broadcastResult = await broadcaster.broadcast(transaction)
      if (broadcastResult.status === 'error') {
        throw new Error('Transaction failed to broadcast')
      }

      toast.dark('Streak created!')
      setStreaks(original => [
        {
          count: 1,
          dayStamp: getTodayStamp(),
          cadenceDays: cadence,
          namespace: namespace.trim(),
          creatorIdentityKey: publicKey,
          token: {
            atomicBeefTX: Utils.toHex(action.tx!),
            txid,
            outputIndex: 0,
            lockingScript,
            satoshis: 1
          }
        },
        ...original
      ])
      setCreateOpen(false)
    } catch (error) {
      toast.error((error as Error).message)
      console.error(error)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleAdvance = async (streakIndex: number): Promise<void> => {
    try {
      setAdvancingIndex(streakIndex)

      if (streakIndex < 0 || streakIndex >= streaks.length) {
        throw new Error('Invalid streak selected')
      }

      const streak = streaks[streakIndex]
      const expectedNext = streak.dayStamp + streak.cadenceDays
      const today = getTodayStamp()

      if (expectedNext !== today) {
        throw new Error('This streak cannot be advanced today')
      }

      if (!streak.token.atomicBeefTX || !streak.token.lockingScript) {
        throw new Error('Streak token data is missing')
      }

      const currentContract = StreakContract.fromLockingScript(
        streak.token.lockingScript
      ) as StreakContract
      const nextContract = StreakContract.fromLockingScript(
        streak.token.lockingScript
      ) as StreakContract
      nextContract.advance(BigInt(today))
      const nextScript = nextContract.lockingScript

      const atomicBeef = Utils.toArray(streak.token.atomicBeefTX, 'hex')
      const tx = Transaction.fromAtomicBEEF(atomicBeef)
      const parsedFromTx = new bsv.Transaction(tx.toHex())

      const unlockingScript = await currentContract.getUnlockingScript(
        async self => {
          const bsvtx = new bsv.Transaction()
          bsvtx.from({
            txId: streak.token.txid,
            outputIndex: streak.token.outputIndex,
            script: streak.token.lockingScript,
            satoshis: streak.token.satoshis
          })
          bsvtx.addOutput(
            new bsv.Transaction.Output({
              script: nextScript,
              satoshis: streak.token.satoshis
            })
          )
          self.to = { tx: bsvtx, inputIndex: 0 }
          self.from = { tx: parsedFromTx, outputIndex: 0 }
            ; (self as StreakContract).advanceOnChain(BigInt(today))
        }
      )

      const broadcastActionParams: CreateActionArgs = {
        inputs: [
          {
            inputDescription: 'Advance streak token',
            outpoint: `${streak.token.txid}.${streak.token.outputIndex}`,
            unlockingScript: unlockingScript.toHex()
          }
        ],
        inputBEEF: atomicBeef,
        outputs: [
          {
            basket: 'streak tokens',
            lockingScript: nextScript.toHex(),
            satoshis: streak.token.satoshis,
            outputDescription: 'Updated streak state'
          }
        ],
        description: 'Advance streak',
        options: { acceptDelayedBroadcast: false, randomizeOutputs: false }
      }

      const newToken = await walletClient.createAction(broadcastActionParams)
      if (!newToken.tx) {
        throw new Error('Failed to create updated streak transaction')
      }

      const transaction = Transaction.fromAtomicBEEF(newToken.tx)
      const txid = transaction.id('hex')

      const facilitator = new HTTPSOverlayBroadcastFacilitator(fetch, true)
      facilitator.allowHTTP = true

      const broadcaster = new SHIPBroadcaster(['tm_streaks'], {
        networkPreset: NETWORK_PRESET,
        facilitator,
        requireAcknowledgmentFromAnyHostForTopics: 'any'
      })

      const broadcastResult = await broadcaster.broadcast(transaction)
      if (broadcastResult.status === 'error') {
        throw new Error('Broadcast was rejected by the overlay')
      }

      toast.dark('Streak advanced!')
      setStreaks(original => {
        const copy = [...original]
        copy[streakIndex] = {
          ...copy[streakIndex],
          count: copy[streakIndex].count + 1,
          dayStamp: today,
          token: {
            atomicBeefTX: Utils.toHex(newToken.tx!),
            txid,
            outputIndex: 0,
            lockingScript: nextScript.toHex(),
            satoshis: streak.token.satoshis
          }
        }
        return copy
      })
    } catch (error) {
      console.error('Failed to advance streak:', error)
      toast.error((error as Error).message)
    } finally {
      setAdvancingIndex(null)
    }
  }

  const handleStartOver = (ns: string): void => {
    setNamespace(ns)
    setCreateOpen(true)
  }

  const renderStreakStatus = (streak: Streak): JSX.Element => {
    const nextExpected = streak.dayStamp + streak.cadenceDays
    const today = getTodayStamp()

    if (today > nextExpected) {
      return (
        <Typography color='error' variant='body2'>
          Streak broken on {formatDayStamp(nextExpected)} – start again to continue.
        </Typography>
      )
    }

    if (today === nextExpected) {
      return (
        <Typography color='success.main' variant='body2'>
          Ready to tick today!
        </Typography>
      )
    }

    return (
      <Typography color='textSecondary' variant='body2'>
        Next tick due on {formatDayStamp(nextExpected)}.
      </Typography>
    )
  }

  return (
    <>
      <AppBar position='fixed'>
        <Toolbar>
          <Typography variant='h6' sx={{ flexGrow: 1 }}>
            SmartStreak — Keep the chain alive.
          </Typography>
          <GitHubIconStyle
            component='a'
            href='https://github.com/bitcoin-sv/smartstreak'
            target='_blank'
            rel='noreferrer'
          >
            <GitHubIcon />
          </GitHubIconStyle>
        </Toolbar>
      </AppBar>
      <AppBarPlaceholder />

      {streaksLoading ? <LoadingBar /> : null}

      {!streaksLoading && streaks.length === 0 ? (
        <NoItems container>
          <Grid item xs={12}>
            <Typography variant='h4'>No Streaks</Typography>
            <Typography variant='body1'>Start your first streak to begin tracking progress.</Typography>
          </Grid>
        </NoItems>
      ) : null}

      <List>
        {streaks.map((streak, index) => {
          const nextExpected = streak.dayStamp + streak.cadenceDays
          const today = getTodayStamp()
          const isBroken = today > nextExpected
          const canAdvance = today === nextExpected
          const isOwner = currentUserIdentityKey === streak.creatorIdentityKey

          return (
            <ListItem key={`${streak.namespace}-${streak.creatorIdentityKey}-${index}`}>
              <Card variant='outlined' sx={{ width: '100%' }}>
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant='h6'>{streak.namespace}</Typography>
                    <Typography variant='body1'>Current streak: {streak.count} day(s)</Typography>
                    <Typography variant='body2'>Last tick: {formatDayStamp(streak.dayStamp)}</Typography>
                    <Typography variant='body2'>Cadence: every {streak.cadenceDays} day(s)</Typography>
                    <Typography 
                      variant='body2' 
                      sx={{ 
                        color: 'text.secondary',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        '&:hover': { color: 'primary.main' }
                      }}
                      onClick={() => {
                        navigator.clipboard.writeText(streak.creatorIdentityKey)
                        toast.dark('Creator identity key copied!')
                      }}
                      title='Click to copy full identity key'
                    >
                      Creator: {streak.creatorIdentityKey.slice(0, 8)}...{streak.creatorIdentityKey.slice(-8)}
                    </Typography>
                    {renderStreakStatus(streak)}
                    {!isOwner && (
                      <Typography variant='body2' sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        Only the creator can advance this streak
                      </Typography>
                    )}
                    <Stack direction='row' spacing={1}>
                      <Button
                        variant='contained'
                        disabled={!canAdvance || !isOwner || advancingIndex === index || createLoading}
                        onClick={() => handleAdvance(index)}
                      >
                        Tick today
                      </Button>
                      <Button
                        variant='outlined'
                        onClick={() => handleStartOver(streak.namespace)}
                        disabled={!isOwner || createLoading}
                      >
                        Start over
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </ListItem>
          )
        })}
      </List>

      <AddMoreFab color='primary' aria-label='add' onClick={() => setCreateOpen(true)}>
        <AddIcon />
      </AddMoreFab>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle>Start a streak</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Provide a namespace and cadence to create a reusable streak token. The first tick will be recorded for today in UTC.
            </DialogContentText>
            <TextField
              autoFocus
              margin='dense'
              label='Namespace'
              type='text'
              fullWidth
              required
              value={namespace}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNamespace(event.target.value)}
            />
            <TextField
              margin='dense'
              label='Cadence (days)'
              type='number'
              fullWidth
              required
              value={cadenceDays}
              inputProps={{ min: 1 }}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCadenceDays(event.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={createLoading}>
              Cancel
            </Button>
            <Button type='submit' disabled={createLoading}>
              {createLoading ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ToastContainer position='bottom-center' hideProgressBar newestOnTop closeOnClick pauseOnFocusLoss={false} />
    </>
  )
}

export default App
