import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { PrizeRead } from '../api/types'
import { copy } from '../copy'
import { prizeBody, prizeForm, prizeFormError, type PrizeForm as Form } from '../lib/parent'
import { Button } from './Button'
import styles from './ParentForms.module.css'
import { TextField } from './TextField'

type Field = keyof Form

interface PrizeFormProps {
  /** The prize being edited; leave out to add a new one. */
  prize?: PrizeRead
  busy: boolean
  /** Resolves true when the server saved it, so a new-prize form can clear itself. */
  onSubmit: (body: { title: string; gem_cost: number }) => Promise<boolean>
  onCancel?: () => void
}

/**
 * "Add a prize" or "Edit <prize>": a name of 1–40 characters and a whole-number gem cost from
 * 1 to 10,000 (REQ-024), checked in the browser first so the server's 422 never shows.
 */
export function PrizeForm({ prize, busy, onSubmit, onCancel }: PrizeFormProps) {
  const id = useId()
  const [form, setForm] = useState(() => prizeForm(prize))
  const [error, setError] = useState<{ field: Field; message: string } | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)

  // An edit form opens in place of the prize card, so the name field takes focus.
  useEffect(() => {
    if (prize) titleRef.current?.focus()
  }, [prize, titleRef])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problem = prizeFormError(form)
    if (problem) {
      setError(problem)
      const field = problem.field === 'title' ? titleRef : costRef
      field.current?.focus()
      return
    }
    if ((await onSubmit(prizeBody(form))) && !prize) setForm(prizeForm())
  }

  const change = (field: Field, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const heading = prize ? copy.prizes.editTitle(prize.title) : copy.prizes.addTitle
  return (
    <form
      className={styles.form}
      aria-labelledby={`${id}-title`}
      onSubmit={(e) => void submit(e)}
      noValidate
    >
      <h3 id={`${id}-title`} className={styles.formTitle}>
        {heading}
      </h3>
      <TextField
        ref={titleRef}
        id={`${id}-name`}
        label={copy.prizes.name}
        hint={copy.prizes.nameHint}
        error={error?.field === 'title' ? error.message : null}
        value={form.title}
        autoComplete="off"
        onChange={(e) => change('title', e.target.value)}
      />
      <TextField
        ref={costRef}
        id={`${id}-cost`}
        label={copy.prizes.cost}
        hint={copy.prizes.costHint}
        error={error?.field === 'cost' ? error.message : null}
        value={form.cost}
        inputMode="numeric"
        autoComplete="off"
        onChange={(e) => change('cost', e.target.value)}
      />
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          icon={prize ? 'check' : 'plus'}
          block={!prize}
          disabled={busy}
        >
          {busy ? copy.parent.saving : prize ? copy.prizes.save : copy.prizes.add}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} disabled={busy}>
            {copy.parent.cancel}
          </Button>
        )}
      </div>
    </form>
  )
}
