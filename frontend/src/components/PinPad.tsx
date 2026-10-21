import { useEffect, useRef } from 'react'
import { copy } from '../copy'
import styles from './PinPad.module.css'

export const PIN_LENGTH = 4
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

interface PinPadProps {
  emoji: string
  nickname: string
  filled: number
  message: string | null
  /** Too many wrong PINs: digits and Delete are off, Back still works (REQ-003). */
  locked: boolean
  /** A PIN is being checked. */
  busy: boolean
  onDigit: (digit: string) => void
  onDelete: () => void
  onBack: () => void
}

/**
 * "Enter Mia's PIN": labelled 0–9 buttons, Back and Delete (REQ-003). The number keys,
 * Backspace and Escape work too, so a PIN can be typed on a keyboard [family-ux #1].
 */
export function PinPad({
  emoji,
  nickname,
  filled,
  message,
  locked,
  busy,
  onDigit,
  onDelete,
  onBack,
}: PinPadProps) {
  const digitsOff = locked || busy
  const handlers = useRef({ onDigit, onDelete, onBack, digitsOff })

  useEffect(() => {
    handlers.current = { onDigit, onDelete, onBack, digitsOff }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const { current } = handlers
      if (/^[0-9]$/.test(event.key)) {
        if (!current.digitsOff) current.onDigit(event.key)
      } else if (event.key === 'Backspace') {
        if (!current.digitsOff) current.onDelete()
      } else if (event.key === 'Escape') {
        current.onBack()
      } else {
        return
      }
      event.preventDefault()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <span key={i} className={`${styles.dot} ${i < filled ? styles.on : ''}`} />
  ))

  return (
    <section className={styles.pad} aria-labelledby="pin-title">
      <div className={styles.head}>
        <span className={styles.avatar} aria-hidden="true">
          {emoji}
        </span>
        <h1 className={styles.title} id="pin-title">
          {copy.pin.title(nickname)}
        </h1>
      </div>
      <div className={styles.dots} role="img" aria-label={copy.pin.progress(filled, PIN_LENGTH)}>
        {dots}
      </div>
      <p className={styles.message} role="status">
        {message ?? (busy ? copy.pin.checking : '')}
      </p>
      <div className={styles.grid} role="group" aria-label={copy.pin.keypad}>
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            className={styles.key}
            disabled={digitsOff}
            onClick={() => onDigit(digit)}
          >
            {digit}
          </button>
        ))}
        <button type="button" className={`${styles.key} ${styles.text}`} onClick={onBack}>
          {copy.pin.back}
        </button>
        <button
          type="button"
          className={styles.key}
          disabled={digitsOff}
          onClick={() => onDigit('0')}
        >
          0
        </button>
        <button
          type="button"
          className={`${styles.key} ${styles.text}`}
          disabled={digitsOff || filled === 0}
          onClick={onDelete}
        >
          {copy.pin.delete}
        </button>
      </div>
    </section>
  )
}
