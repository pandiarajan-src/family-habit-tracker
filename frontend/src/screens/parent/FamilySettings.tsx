import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import { useResource, type LoadOptions } from '../../api/hooks'
import type { HabitRead, MemberRead } from '../../api/types'
import { useActiveSession, useSession } from '../../auth/useSession'
import { Button } from '../../components/Button'
import { ButtonLink } from '../../components/ButtonLink'
import { Loading } from '../../components/Loading'
import { MemberForm } from '../../components/MemberForm'
import { Notice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { RemoveMemberDialog } from '../../components/RemoveMemberDialog'
import { ResetPinForm } from '../../components/ResetPinForm'
import { TimezoneSelect } from '../../components/TimezoneSelect'
import { copy } from '../../copy'
import { isOnlyParent, memberChanges, zoneLabel, type MemberForm as Form } from '../../lib/parent'
import styles from './FamilySettings.module.css'

interface SettingsData {
  timezone: string
  members: MemberRead[]
  /** Every member's habits, archived too, so the remove confirmation can count them. */
  habits: HabitRead[]
}

async function loadSettings(options: LoadOptions): Promise<SettingsData> {
  const [family, members, habits] = await Promise.all([
    api.getFamily(options),
    api.listMembers(options),
    api.listHabits(options, { include_archived: true }),
  ])
  return { timezone: family.timezone, members, habits }
}

type Action = 'add' | 'edit' | 'pin' | 'remove'
type Open = { kind: Action; id: string } | null
type Message = { tone: 'info' | 'caution'; text: string } | null

const ADD = 'new'

/**
 * Parent: Family settings. Members with Add / Edit / Remove (REQ-006, REQ-007), and for each
 * child "Reset <child>’s PIN" (REQ-005) and "<child>’s habits" (REQ-010, C15); the family
 * timezone (REQ-027); and "Sign this device out" (REQ-002). One form or confirmation is open at
 * a time, inside the card it belongs to.
 */
export function FamilySettings() {
  const { signOut, refresh } = useSession()
  const me = useActiveSession()?.acting_member
  const settings = useResource('settings', loadSettings)
  const [open, setOpen] = useState<Open>(null)
  /** After Cancel or Keep, focus goes back to the button that opened the form or dialog. */
  const [refocus, setRefocus] = useState<Open>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [formTrouble, setFormTrouble] = useState<string | null>(null)
  /** The zone picked in the select; null until it differs from the saved one. */
  const [zone, setZone] = useState<string | null>(null)
  const membersHeading = useRef<HTMLHeadingElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (refocus?.kind === 'add') addRef.current?.focus()
  }, [refocus])

  // RequireParent renders this screen only for a parent who is checking in.
  if (!me) return null
  const data = settings.data
  if (!data) {
    return settings.loading ? (
      <Loading />
    ) : (
      <Notice
        tone="caution"
        actions={<Button onClick={() => void settings.reload()}>{copy.parent.tryAgain}</Button>}
      >
        {copy.parent.loadTrouble}
      </Notice>
    )
  }

  const show = (kind: Action, id: string) => {
    setRefocus(null)
    setFormTrouble(null)
    setOpen({ kind, id })
  }
  const close = () => {
    setRefocus(open)
    setOpen(null)
    setFormTrouble(null)
  }

  /**
   * Runs one change, then re-reads the family; the server has the last word. Every button is
   * disabled while `busy`. On success the form closes and focus moves to the members heading,
   * because the button that opened it may be gone. Returns the error, if any.
   */
  const act = async (request: () => Promise<unknown>, done: string): Promise<unknown> => {
    setBusy(true)
    setMessage(null)
    setFormTrouble(null)
    let failure: unknown = null
    try {
      await request()
      setMessage({ tone: 'info', text: done })
      setOpen(null)
    } catch (error) {
      failure = error
    }
    await settings.reload()
    setBusy(false)
    if (failure === null) membersHeading.current?.focus()
    return failure
  }

  const saveMember = async (member: MemberRead | null, form: Form) => {
    if (member === null) {
      const nickname = form.nickname.trim()
      const failure = await act(
        () =>
          api.createMember({
            nickname,
            avatar_emoji: form.avatar.trim(),
            role: form.role,
            pin: form.pin,
          }),
        copy.settings.added(nickname),
      )
      if (failure)
        setFormTrouble(isApiError(failure, 422) ? copy.settings.notSaved : copy.parent.trouble)
      return
    }
    const changes = memberChanges(form, member)
    if (Object.keys(changes).length === 0) {
      close()
      return
    }
    const failure = await act(
      () => api.updateMember(member.id, changes),
      copy.settings.saved(changes.nickname ?? member.nickname),
    )
    if (failure) {
      setFormTrouble(isApiError(failure, 422) ? copy.settings.notSaved : copy.parent.trouble)
    } else if (member.id === me.id) {
      // The header shows the acting member's nickname, avatar and role.
      await refresh().catch(() => {})
    }
  }

  const resetPin = async (child: MemberRead, pin: string) => {
    const failure = await act(
      () => api.setPin(child.id, { pin }),
      copy.settings.pinSaved(child.nickname),
    )
    if (failure) setFormTrouble(copy.parent.trouble)
  }

  const remove = async (member: MemberRead) => {
    const failure = await act(
      () => api.deleteMember(member.id),
      copy.settings.removed(member.nickname),
    )
    if (isApiError(failure, 422)) {
      setOpen(null)
      setMessage({ tone: 'caution', text: copy.settings.needsParent })
    } else if (failure) {
      setMessage({ tone: 'caution', text: copy.parent.trouble })
    } else if (member.id === me.id) {
      // Nobody is checking in on this device any more, so it goes back to the board.
      await refresh().catch(() => {})
    }
  }

  const saveZone = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || zone === null) return
    setBusy(true)
    setMessage(null)
    try {
      await api.updateFamily({ timezone: zone })
      setMessage({ tone: 'info', text: copy.settings.timezoneSaved(zoneLabel(zone)) })
      setZone(null)
    } catch {
      setMessage({ tone: 'caution', text: copy.settings.timezoneWrong })
    }
    await settings.reload()
    setBusy(false)
  }

  const onSignOut = async () => {
    setBusy(true)
    try {
      // The session then shows Passcode entry (REQ-002).
      await signOut()
    } catch {
      setMessage({ tone: 'caution', text: copy.parent.trouble })
      setBusy(false)
    }
  }

  const editing = open?.kind === 'add'
  return (
    <>
      {message && (
        <Notice tone={message.tone} icon={message.tone === 'info' ? 'check' : 'info'}>
          {message.text}
        </Notice>
      )}

      <section className={styles.section} aria-labelledby="members-title">
        <div className={styles.sectionHead}>
          <h2 id="members-title" className={styles.sectionTitle} ref={membersHeading} tabIndex={-1}>
            {copy.settings.membersTitle}
          </h2>
          {!editing && (
            <Button
              ref={addRef}
              variant="primary"
              icon="plus"
              disabled={busy}
              onClick={() => show('add', ADD)}
            >
              {copy.settings.addMember}
            </Button>
          )}
        </div>

        {editing && (
          <div className={styles.card}>
            <MemberForm
              member={null}
              members={data.members}
              busy={busy}
              trouble={formTrouble}
              onSubmit={(form) => void saveMember(null, form)}
              onCancel={close}
            />
          </div>
        )}

        <ul className={styles.members}>
          {data.members.map((member) => (
            <li key={member.id} className={styles.card}>
              <MemberCard
                member={member}
                me={me}
                onlyParent={isOnlyParent(member, data.members)}
                busy={busy}
                open={open?.id === member.id ? open.kind : null}
                focus={refocus?.id === member.id ? refocus.kind : null}
                onOpen={(kind) => show(kind, member.id)}
              />
              {open?.id === member.id && open.kind === 'edit' && (
                <MemberForm
                  member={member}
                  members={data.members}
                  busy={busy}
                  trouble={formTrouble}
                  onSubmit={(form) => void saveMember(member, form)}
                  onCancel={close}
                />
              )}
              {open?.id === member.id && open.kind === 'pin' && (
                <>
                  <ResetPinForm
                    child={member}
                    busy={busy}
                    onSubmit={(pin) => void resetPin(member, pin)}
                    onCancel={close}
                  />
                  {formTrouble && <Notice tone="caution">{formTrouble}</Notice>}
                </>
              )}
              {open?.id === member.id && open.kind === 'remove' && (
                <RemoveMemberDialog
                  member={member}
                  habits={data.habits}
                  busy={busy}
                  onConfirm={() => void remove(member)}
                  onCancel={close}
                />
              )}
            </li>
          ))}
        </ul>
        <p className={styles.note}>{copy.settings.needsParent}</p>
      </section>

      <Panel title={copy.settings.dayTitle}>
        <form className={styles.form} onSubmit={(e) => void saveZone(e)}>
          <TimezoneSelect
            id="family-timezone"
            current={data.timezone}
            value={zone ?? data.timezone}
            disabled={busy}
            onChange={(picked) => setZone(picked === data.timezone ? null : picked)}
          />
          <Button type="submit" variant="primary" block disabled={busy || zone === null}>
            {copy.settings.saveTimezone}
          </Button>
        </form>
      </Panel>

      <Panel title={copy.settings.deviceTitle}>
        <p className={styles.text}>{copy.settings.deviceText}</p>
        <Button icon="signOut" block disabled={busy} onClick={() => void onSignOut()}>
          {copy.settings.signOut}
        </Button>
      </Panel>
    </>
  )
}

interface MemberCardProps {
  member: MemberRead
  me: MemberRead
  /** The only parent can't be removed (REQ-007), so Remove isn't offered. */
  onlyParent: boolean
  busy: boolean
  /** Which form or dialog is open for this member; its buttons hide meanwhile. */
  open: Action | null
  /** Which button takes focus back after its form or dialog closed. */
  focus: Action | null
  onOpen: (kind: Action) => void
}

/** Avatar, nickname and role, then Edit / Reset PIN / habits / Remove as fit the member. */
function MemberCard({ member, me, onlyParent, busy, open, focus, onOpen }: MemberCardProps) {
  const edit = useRef<HTMLButtonElement>(null)
  const pin = useRef<HTMLButtonElement>(null)
  const remove = useRef<HTMLButtonElement>(null)
  const role = copy.settings.roles[member.role]
  const isChild = member.role === 'child'
  const name = member.nickname

  useEffect(() => {
    if (focus === 'edit') edit.current?.focus()
    if (focus === 'pin') pin.current?.focus()
    if (focus === 'remove') remove.current?.focus()
  }, [focus, edit, pin, remove])

  return (
    <div className={styles.member}>
      <div className={styles.who}>
        <span className={styles.avatar} aria-hidden="true">
          {member.avatar_emoji}
        </span>
        <div>
          <h3 className={styles.name}>{name}</h3>
          <p className={styles.role}>{member.id === me.id ? copy.settings.thatsYou(role) : role}</p>
        </div>
      </div>
      {open === null && (
        <div className={styles.actions}>
          <Button ref={edit} size="sm" icon="edit" disabled={busy} onClick={() => onOpen('edit')}>
            {copy.settings.edit} <span className="sr-only">{copy.settings.forMember(name)}</span>
          </Button>
          {isChild && (
            <Button ref={pin} size="sm" icon="key" disabled={busy} onClick={() => onOpen('pin')}>
              {copy.settings.resetPin(name)}
            </Button>
          )}
          {isChild && (
            <ButtonLink size="sm" icon="list" to={`/habits?member=${member.id}`}>
              {copy.settings.habits(name)}
            </ButtonLink>
          )}
          {!onlyParent && (
            <Button
              ref={remove}
              size="sm"
              variant="dangerOutline"
              icon="trash"
              disabled={busy}
              onClick={() => onOpen('remove')}
            >
              {copy.settings.remove}{' '}
              <span className="sr-only">{copy.settings.forMember(name)}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
