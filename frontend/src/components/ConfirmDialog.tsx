import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import styles from './ConfirmDialog.module.css'
import type { IconName } from './Icon'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  confirmIcon?: IconName
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * An inline "are you sure?" panel for something that can't be undone (REQ-009). It takes a
 * second, explicit tap; focus moves to the safe choice, and Escape keeps things as they are.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  confirmIcon,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const textId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  const onCancelRef = useRef(onCancel)

  useEffect(() => {
    onCancelRef.current = onCancel
  })

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className={styles.dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div id={textId} className={styles.text}>
        {children}
      </div>
      <div className={styles.actions}>
        <Button variant="danger" icon={confirmIcon} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
