import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { isApiError } from '../api/client'
import { useSession } from '../auth/useSession'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Notice } from '../components/Notice'
import { copy } from '../copy'
import { formatClockTime } from '../lib/format'
import styles from './PasscodeEntry.module.css'

/** The server's passcode limit: 10 wrong tries, then wait 15 minutes (REQ-001). */
const DEFAULT_WAIT_SECONDS = 15 * 60

type Problem = 'empty' | 'wrong' | 'trouble' | null

/**
 * Passcode entry, the only screen without a session (REQ-001). Shows the wrong-passcode
 * message (401), the short-break state with Unlock disabled (429), and the idle note after
 * a timeout (REQ-004).
 */
export function PasscodeEntry() {
  const { state, unlock } = useSession()
  const [passcode, setPasscode] = useState('')
  const [problem, setProblem] = useState<Problem>(null)
  const [submitting, setSubmitting] = useState(false)
  const [waitUntil, setWaitUntil] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (waitUntil === null) return
    const timer = window.setTimeout(() => setWaitUntil(null), Math.max(0, waitUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [waitUntil])

  if (state.status === 'active') return <Navigate to="/" replace />

  const waiting = waitUntil !== null
  const showIdleNote = state.status === 'signed-out' && state.reason === 'idle' && !waiting
  const fieldError =
    problem === 'empty' ? copy.passcode.empty : problem === 'wrong' ? copy.passcode.wrong : null

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (waiting || submitting) return
    if (passcode === '') {
      setProblem('empty')
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    setProblem(null)
    try {
      await unlock(passcode)
      // The session is now active, so this screen redirects to the Family board.
    } catch (error) {
      setSubmitting(false)
      if (isApiError(error, 429)) {
        setWaitUntil(Date.now() + (error.retryAfter ?? DEFAULT_WAIT_SECONDS) * 1000)
      } else if (isApiError(error, 401)) {
        setProblem('wrong')
        inputRef.current?.focus()
      } else {
        setProblem('trouble')
      }
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.brand} aria-hidden="true">
        <div className={styles.bars}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.dots}>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className={styles.tagline}>{copy.passcode.tagline}</p>
      </div>
      <main className={styles.main}>
        <form
          className={styles.form}
          aria-labelledby={`${id}-title`}
          onSubmit={onSubmit}
          noValidate
        >
          <div className={styles.intro}>
            <span className={styles.app}>{copy.appTitle}</span>
            <h1 id={`${id}-title`} className="page-title">
              {copy.passcode.title}
            </h1>
            <p className="page-lead">{copy.passcode.lead}</p>
          </div>
          {showIdleNote && (
            <Notice tone="caution" icon="shield" title={copy.passcode.idleTitle}>
              {copy.passcode.idleText}
            </Notice>
          )}
          {waiting && (
            <Notice tone="caution" icon="clock" title={copy.passcode.waitTitle}>
              {copy.passcode.waitText}
            </Notice>
          )}
          <div className={`${styles.field} ${fieldError ? styles.hasError : ''}`}>
            <label className={styles.label} htmlFor={`${id}-passcode`}>
              {copy.passcode.label}
            </label>
            <input
              ref={inputRef}
              id={`${id}-passcode`}
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ''}`}
            />
            <p className={styles.hint} id={`${id}-hint`}>
              {copy.passcode.hint}
            </p>
            {fieldError && (
              <p className={styles.error} id={`${id}-error`} role="alert">
                <Icon name="info" size={18} />
                {fieldError}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            icon="lock"
            block
            disabled={waiting || submitting}
          >
            {submitting ? copy.passcode.unlocking : copy.passcode.unlock}
          </Button>
          {waiting && (
            <p className={styles.wait} role="status">
              {copy.passcode.tryAgainAt(formatClockTime(waitUntil))}
            </p>
          )}
          {problem === 'trouble' && (
            <p className={styles.wait} role="alert">
              {copy.passcode.trouble}
            </p>
          )}
          <p className={styles.footer}>{copy.passcode.footer}</p>
        </form>
      </main>
    </div>
  )
}
