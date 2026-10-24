import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useActiveSession } from '../auth/useSession'
import { Button } from '../components/Button'
import { ButtonLink } from '../components/ButtonLink'
import { Notice } from '../components/Notice'
import { TextField } from '../components/TextField'
import { copy } from '../copy'
import { minutesFromSeconds } from '../lib/format'
import { pinFormError, type PinField, type PinForm, type PinFormError } from '../lib/habits'
import styles from './MyPin.module.css'

/** The server's PIN lockout: 5 wrong tries, then 5 minutes (REQ-003); no Retry-After here. */
const DEFAULT_LOCK_SECONDS = 5 * 60
const EMPTY: PinForm = { current: '', next: '', again: '' }

type Outcome = { kind: 'saved' } | { kind: 'trouble' } | { kind: 'locked'; minutes: number } | null

/**
 * My PIN (reached from My habits): change your own PIN with your current one (REQ-005, C14).
 * Both PINs must be 4 numbers and the confirmation must match before anything is sent. A
 * wrong current PIN (401 `MemberPIN`) counts toward the lockout; a 429 pauses the form.
 */
export function MyPin() {
  const me = useActiveSession()?.acting_member
  const [form, setForm] = useState<PinForm>(EMPTY)
  const [error, setError] = useState<PinFormError | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [busy, setBusy] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const refs = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
    again: useRef<HTMLInputElement>(null),
  }

  useEffect(() => {
    if (lockedUntil === null) return
    const timer = window.setTimeout(
      () => {
        setLockedUntil(null)
        setOutcome(null)
      },
      Math.max(0, lockedUntil - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [lockedUntil])

  // MemberLayout renders this screen only while someone is checking in.
  if (!me) return null

  const fail = (field: PinField, message: string) => {
    setError({ field, message })
    refs[field].current?.focus()
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || lockedUntil !== null) return
    setOutcome(null)
    const problem = pinFormError(form)
    if (problem) {
      fail(problem.field, problem.message)
      return
    }
    setBusy(true)
    try {
      await api.setPin(me.id, { pin: form.next, current_pin: form.current })
      setForm(EMPTY)
      setOutcome({ kind: 'saved' })
    } catch (failure) {
      if (isApiError(failure, 429)) {
        const seconds = failure.retryAfter ?? DEFAULT_LOCK_SECONDS
        setLockedUntil(Date.now() + seconds * 1000)
        setOutcome({ kind: 'locked', minutes: minutesFromSeconds(seconds) })
      } else if (isApiError(failure, 401)) {
        // `FamilyPasscode` has already signed the device out; only a wrong PIN stays here.
        if (failure.challenge === 'MemberPIN') {
          setForm((prev) => ({ ...prev, current: '' }))
          fail('current', copy.myPin.wrongCurrent)
        }
      } else {
        setOutcome({ kind: 'trouble' })
      }
    } finally {
      setBusy(false)
    }
  }

  const field = (name: PinField, label: string, autoComplete: string, hint?: string) => (
    <TextField
      ref={refs[name]}
      id={`pin-${name}`}
      label={label}
      hint={hint}
      error={error?.field === name ? error.message : null}
      type="password"
      inputMode="numeric"
      autoComplete={autoComplete}
      maxLength={4}
      value={form[name]}
      disabled={lockedUntil !== null}
      onChange={(event) => {
        const value = event.target.value
        setForm((prev) => ({ ...prev, [name]: value }))
        setError(null)
      }}
    />
  )

  return (
    <main className="page">
      <ButtonLink variant="quiet" icon="previous" to="/habits" className={styles.back}>
        {copy.myPin.back}
      </ButtonLink>

      <div className={styles.column}>
        <div className={styles.titles}>
          <h1 className="page-title">{copy.screens.myPin}</h1>
          <p className="page-lead">{copy.myPin.lead}</p>
        </div>

        <form className={styles.card} onSubmit={(e) => void onSubmit(e)} noValidate>
          {field('current', copy.myPin.current, 'current-password')}
          {field('next', copy.myPin.next, 'new-password', copy.myPin.nextHint)}
          {field('again', copy.myPin.again, 'new-password')}

          {outcome?.kind === 'saved' && <Notice icon="check">{copy.myPin.saved}</Notice>}
          {outcome?.kind === 'trouble' && <Notice tone="caution">{copy.myPin.trouble}</Notice>}
          {outcome?.kind === 'locked' && (
            <Notice tone="caution" icon="clock">
              {copy.pin.locked(outcome.minutes)}
            </Notice>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            icon="key"
            block
            disabled={busy || lockedUntil !== null}
          >
            {busy ? copy.myPin.saving : copy.myPin.save}
          </Button>
        </form>

        <Notice tone="caution" icon="people" title={copy.myPin.forgotTitle}>
          {copy.myPin.forgotText}
        </Notice>
      </div>
    </main>
  )
}
