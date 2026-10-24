import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { MemberRead, Role } from '../api/types'
import { copy } from '../copy'
import {
  isOnlyParent,
  memberForm,
  memberFormError,
  type MemberField,
  type MemberForm as Form,
} from '../lib/parent'
import { Button } from './Button'
import styles from './ParentForms.module.css'
import { Segmented } from './Segmented'
import { TextField } from './TextField'
import fieldStyles from './TextField.module.css'

const ROLES = [
  { id: 'parent' as Role, label: copy.settings.roles.parent },
  { id: 'child' as Role, label: copy.settings.roles.child },
]

interface MemberFormProps {
  /** The member being edited; null to add a new one. */
  member: MemberRead | null
  members: MemberRead[]
  busy: boolean
  /** A kind message when the server refused the form (a 422 the browser couldn't foresee). */
  trouble?: string | null
  onSubmit: (form: Form) => void
  onCancel: () => void
}

/**
 * Add or edit a member: nickname, one avatar emoji and a role, plus a first PIN for a new
 * member (REQ-006). Nothing else is asked for [child-data-privacy #1]. The only parent's role
 * can't change, so it shows as fixed text.
 */
export function MemberForm({
  member,
  members,
  busy,
  trouble,
  onSubmit,
  onCancel,
}: MemberFormProps) {
  const id = useId()
  const [form, setForm] = useState(() => memberForm(member ?? undefined))
  const [error, setError] = useState<{ field: MemberField; message: string } | null>(null)
  const nicknameRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const roleFixed = member !== null && isOnlyParent(member, members)

  useEffect(() => {
    nicknameRef.current?.focus()
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problem = memberFormError(form, members, member)
    if (problem) {
      setError(problem)
      const field = { nickname: nicknameRef, avatar: avatarRef, pin: pinRef, role: nicknameRef }
      field[problem.field].current?.focus()
      return
    }
    onSubmit(form)
  }

  const change = (patch: Partial<Form>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setError(null)
  }
  const errorFor = (field: MemberField) => (error?.field === field ? error.message : null)

  return (
    <form className={styles.form} aria-labelledby={`${id}-title`} onSubmit={submit} noValidate>
      <h3 id={`${id}-title`} className={styles.formTitle}>
        {member ? copy.settings.editTitle(member.nickname) : copy.settings.addTitle}
      </h3>
      <TextField
        ref={nicknameRef}
        id={`${id}-nickname`}
        label={copy.settings.nickname}
        hint={copy.settings.nicknameHint}
        error={errorFor('nickname')}
        value={form.nickname}
        autoComplete="off"
        onChange={(e) => change({ nickname: e.target.value })}
      />
      <TextField
        ref={avatarRef}
        id={`${id}-avatar`}
        label={copy.settings.avatar}
        hint={copy.settings.avatarHint}
        error={errorFor('avatar')}
        value={form.avatar}
        autoComplete="off"
        className={`${fieldStyles.input} ${styles.emoji}`}
        onChange={(e) => change({ avatar: e.target.value })}
      />
      <div className={styles.group}>
        <p className={fieldStyles.label}>{copy.settings.role}</p>
        {roleFixed ? (
          <>
            <p className={styles.fixed}>{copy.settings.roles.parent}</p>
            <p className={fieldStyles.hint}>{copy.settings.roleFixed}</p>
          </>
        ) : (
          <Segmented
            label={copy.settings.role}
            options={ROLES}
            value={form.role}
            onChange={(role) => change({ role })}
          />
        )}
      </div>
      {member === null && (
        <TextField
          ref={pinRef}
          id={`${id}-pin`}
          label={copy.settings.pin}
          hint={copy.settings.pinHint}
          error={errorFor('pin')}
          value={form.pin}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          onChange={(e) => change({ pin: e.target.value })}
        />
      )}
      {trouble && (
        <p className={styles.trouble} role="status">
          {trouble}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" icon="check" disabled={busy}>
          {busy ? copy.parent.saving : member ? copy.settings.save : copy.settings.add}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {copy.parent.cancel}
        </Button>
      </div>
    </form>
  )
}
