import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { Icon } from './Icon'
import styles from './TextField.module.css'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  /** Shown after the label in a lighter weight, e.g. "(optional)". */
  labelNote?: string
  hint?: string
  error?: string | null
  ref?: Ref<HTMLInputElement>
}

/**
 * A labelled input with an optional hint and a kind error message, both tied to the input
 * with `aria-describedby` so screen readers read them with the field.
 */
export function TextField({ id, label, labelNote, hint, error, ...input }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <FieldShell id={id} label={label} labelNote={labelNote} hint={hint} error={error}>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        {...input}
      />
    </FieldShell>
  )
}

/** Label, control, hint and error laid out as one field; the control is the child. */
export function FieldShell({
  id,
  label,
  labelNote,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  labelNote?: string
  hint?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ''}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {labelNote && <span className={styles.labelNote}> {labelNote}</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          <Icon name="info" size={18} />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
