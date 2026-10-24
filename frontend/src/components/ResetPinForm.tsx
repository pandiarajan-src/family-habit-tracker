import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { MemberRead } from '../api/types'
import { copy } from '../copy'
import { resetPinError, type ResetField } from '../lib/parent'
import { Button } from './Button'
import styles from './ParentForms.module.css'
import { TextField } from './TextField'

interface ResetPinFormProps {
  child: MemberRead
  busy: boolean
  onSubmit: (pin: string) => void
  onCancel: () => void
}

/**
 * A parent sets a new PIN for a child who forgot theirs: no current PIN, just the new one
 * typed twice. The second copy is checked here and never sent (REQ-005).
 */
export function ResetPinForm({ child, busy, onSubmit, onCancel }: ResetPinFormProps) {
  const id = useId()
  const [pins, setPins] = useState({ next: '', again: '' })
  const [error, setError] = useState<{ field: ResetField; message: string } | null>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const againRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nextRef.current?.focus()
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problem = resetPinError(pins.next, pins.again)
    if (problem) {
      setError(problem)
      const field = problem.field === 'next' ? nextRef : againRef
      field.current?.focus()
      return
    }
    onSubmit(pins.next)
  }

  const change = (field: ResetField, value: string) => {
    setPins((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  return (
    <form className={styles.form} aria-labelledby={`${id}-title`} onSubmit={submit} noValidate>
      <h3 id={`${id}-title`} className={styles.formTitle}>
        {copy.settings.resetTitle(child.nickname)}
      </h3>
      <TextField
        ref={nextRef}
        id={`${id}-next`}
        label={copy.settings.newPin}
        hint={copy.settings.newPinHint}
        error={error?.field === 'next' ? error.message : null}
        value={pins.next}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={4}
        onChange={(e) => change('next', e.target.value)}
      />
      <TextField
        ref={againRef}
        id={`${id}-again`}
        label={copy.settings.again}
        error={error?.field === 'again' ? error.message : null}
        value={pins.again}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        maxLength={4}
        onChange={(e) => change('again', e.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" variant="primary" icon="key" disabled={busy}>
          {busy ? copy.parent.saving : copy.settings.savePin(child.nickname)}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {copy.parent.cancel}
        </Button>
      </div>
    </form>
  )
}
