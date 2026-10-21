import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { isApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useResource } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { AppHeader } from '../components/AppHeader'
import { Loading } from '../components/Loading'
import { PIN_LENGTH, PinPad } from '../components/PinPad'
import { copy } from '../copy'
import { minutesFromSeconds } from '../lib/format'
import { useNow } from '../lib/useNow'
import styles from './PinEntry.module.css'

/** The server's PIN lockout: 5 wrong tries, then 5 minutes (REQ-003). */
const DEFAULT_LOCK_SECONDS = 5 * 60

type Problem = 'wrong' | 'trouble' | null

/**
 * "Enter Mia's PIN" at `/pin/:memberId`, so the browser Back button returns to the board.
 * A correct PIN makes the member the acting member and opens My day (REQ-003). A wrong PIN
 * (401 `MemberPIN`) clears the pad; a 401 `FamilyPasscode` is handled by the session, which
 * shows Passcode entry; a 429 disables the keypad until the lockout ends.
 */
export function PinEntry() {
  const { memberId = '' } = useParams()
  const { chooseMember } = useSession()
  const navigate = useNavigate()
  const members = useResource('members', api.listMembers)
  const [pin, setPin] = useState('')
  const [problem, setProblem] = useState<Problem>(null)
  const [busy, setBusy] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const now = useNow(1000)

  useEffect(() => {
    if (lockedUntil === null) return
    const timer = window.setTimeout(
      () => setLockedUntil(null),
      Math.max(0, lockedUntil - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [lockedUntil])

  if (members.loading) return <Loading />
  const member = members.data?.find((m) => m.id === memberId)
  if (!member) return <Navigate to="/" replace />

  const submit = async (fullPin: string) => {
    setBusy(true)
    try {
      await chooseMember(member.id, fullPin)
      navigate('/my-day', { replace: true })
    } catch (error) {
      setBusy(false)
      setPin('')
      if (isApiError(error, 429)) {
        setProblem(null)
        setLockedUntil(Date.now() + (error.retryAfter ?? DEFAULT_LOCK_SECONDS) * 1000)
      } else if (isApiError(error, 401)) {
        // `FamilyPasscode` has already signed the device out; only a wrong PIN stays here.
        if (error.challenge === 'MemberPIN') setProblem('wrong')
      } else if (isApiError(error, 404)) {
        navigate('/', { replace: true })
      } else {
        setProblem('trouble')
      }
    }
  }

  const onDigit = (digit: string) => {
    if (busy || pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    setProblem(null)
    if (next.length === PIN_LENGTH) void submit(next)
  }

  const locked = lockedUntil !== null
  const message = locked
    ? copy.pin.locked(minutesFromSeconds((lockedUntil - now) / 1000))
    : problem === 'wrong'
      ? copy.pin.wrong
      : problem === 'trouble'
        ? copy.pin.trouble
        : null

  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <PinPad
          emoji={member.avatar_emoji}
          nickname={member.nickname}
          filled={pin.length}
          message={message}
          locked={locked}
          busy={busy}
          onDigit={onDigit}
          onDelete={() => setPin(pin.slice(0, -1))}
          onBack={() => navigate('/')}
        />
        <p className={styles.forgot}>{copy.pin.forgot}</p>
      </main>
    </>
  )
}
