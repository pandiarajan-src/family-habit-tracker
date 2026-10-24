import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { isApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useResource, type LoadOptions } from '../api/hooks'
import type { HabitRead, MemberRead } from '../api/types'
import { useActiveSession } from '../auth/useSession'
import { Button } from '../components/Button'
import { ButtonLink } from '../components/ButtonLink'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Loading } from '../components/Loading'
import { Notice } from '../components/Notice'
import { Segmented } from '../components/Segmented'
import { FieldShell, TextField } from '../components/TextField'
import fieldStyles from '../components/TextField.module.css'
import { copy } from '../copy'
import {
  emptyForm,
  formFromHabit,
  GOAL_MAX,
  goalNoteValue,
  habitFormError,
  habitOwner,
  MAX_ACTIVE_HABITS,
  ownerQuery,
  TARGETS,
  TITLE_MAX,
  type FormError,
  type HabitForm,
  type HabitOwner,
} from '../lib/habits'
import styles from './HabitEditor.module.css'
import { ParentModeBanner, type HabitsNote } from './MyHabits'

interface EditorData {
  owner: HabitOwner
  /** Null when adding a habit. */
  habit: HabitRead | null
  /** False when the habit belongs to someone the acting member can't change (REQ-010). */
  allowed: boolean
}

async function loadEditor(
  me: MemberRead,
  habitId: string | undefined,
  requestedId: string | null,
  options: LoadOptions,
): Promise<EditorData> {
  if (habitId === undefined) {
    const members = await api.listMembers(options)
    return { owner: habitOwner(me, members, requestedId), habit: null, allowed: true }
  }
  const [members, habit] = await Promise.all([
    api.listMembers(options),
    api.getHabit(habitId, options),
  ])
  const owner = habitOwner(me, members, habit.member_id)
  if (owner.member.id === habit.member_id) return { owner, habit, allowed: true }
  const realOwner = members.find((m) => m.id === habit.member_id) ?? owner.member
  return { owner: { member: realOwner, parentMode: false }, habit, allowed: false }
}

/**
 * Add a habit (`/habits/new`) or edit one (`/habits/:habitId`): title, goal note, daily or
 * weekly with a target, then archive, bring back or delete with a confirmation step
 * (REQ-008, REQ-009). In parent mode (`?member=<child>`) the banner shows and new habits are
 * made for the child (C15, REQ-010).
 */
export function HabitEditor() {
  const me = useActiveSession()?.acting_member
  const { habitId } = useParams()
  const [params] = useSearchParams()
  const requestedId = params.get('member')
  const editor = useResource(`habit-editor:${me?.id}:${habitId}:${requestedId}`, (options) =>
    loadEditor(me as MemberRead, habitId, requestedId, options),
  )

  // MemberLayout renders this screen only while someone is checking in.
  if (!me) return null
  const data = editor.data

  if (!data) {
    const gone = isApiError(editor.error, 404)
    return (
      <main className="page">
        {editor.loading ? (
          <Loading />
        ) : (
          <>
            <BackLink owner={null} />
            <Notice
              tone="caution"
              actions={
                gone ? undefined : (
                  <Button onClick={() => void editor.reload()}>{copy.habits.tryAgain}</Button>
                )
              }
            >
              {gone ? copy.editor.gone : copy.habits.loadTrouble}
            </Notice>
          </>
        )}
      </main>
    )
  }

  if (!data.allowed) {
    return (
      <main className="page">
        <BackLink owner={null} />
        <Notice tone="caution">{copy.editor.notYours(data.owner.member.nickname)}</Notice>
      </main>
    )
  }

  return <EditorForm key={data.habit?.id ?? 'new'} owner={data.owner} habit={data.habit} />
}

function BackLink({ owner }: { owner: HabitOwner | null }) {
  const label = owner?.parentMode ? copy.editor.backTo(owner.member.nickname) : copy.editor.back
  return (
    <ButtonLink
      variant="quiet"
      icon="previous"
      to={`/habits${owner ? ownerQuery(owner) : ''}`}
      className={styles.back}
    >
      {label}
    </ButtonLink>
  )
}

type Busy = 'save' | 'archive' | 'delete' | null

function EditorForm({ owner, habit }: { owner: HabitOwner; habit: HabitRead | null }) {
  const navigate = useNavigate()
  const [form, setForm] = useState<HabitForm>(() => (habit ? formFromHabit(habit) : emptyForm()))
  const [fieldError, setFieldError] = useState<FormError<'title' | 'goalNote'> | null>(null)
  const [trouble, setTrouble] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [confirming, setConfirming] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const goalRef = useRef<HTMLInputElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  const listPath = `/habits${ownerQuery(owner)}`
  const backToList = (note: string) => navigate(listPath, { state: { note } satisfies HabitsNote })
  const update = (changes: Partial<HabitForm>) => {
    setForm((prev) => ({ ...prev, ...changes }))
    setFieldError(null)
  }

  /** Runs a write; a 422 shows `on422`, a 404 says the habit is gone, anything else is kind. */
  const run = async (kind: Busy, write: () => Promise<string>, on422: string) => {
    setBusy(kind)
    setTrouble(null)
    try {
      backToList(await write())
    } catch (error) {
      setBusy(null)
      if (isApiError(error, 422)) setTrouble(on422)
      else if (isApiError(error, 404)) setTrouble(copy.editor.gone)
      else setTrouble(copy.habits.saveTrouble)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const problem = habitFormError(form)
    if (problem) {
      setFieldError(problem)
      ;(problem.field === 'title' ? titleRef : goalRef).current?.focus()
      return
    }
    const title = form.title.trim()
    const weekly = form.frequency === 'weekly'
    if (habit === null) {
      // The browser checks match the server's, so a 422 here is the 20-habit limit (REQ-008).
      void run(
        'save',
        async () => {
          await api.createHabit({
            member_id: owner.member.id,
            title,
            goal_note: goalNoteValue(form),
            frequency: form.frequency,
            ...(weekly && { weekly_target: form.target }),
          })
          return copy.habits.added(title)
        },
        copy.habits.limit(MAX_ACTIVE_HABITS),
      )
    } else {
      void run(
        'save',
        async () => {
          await api.updateHabit(habit.id, {
            title,
            goal_note: goalNoteValue(form),
            ...(weekly && { weekly_target: form.target }),
          })
          return copy.habits.saved(title)
        },
        copy.habits.saveTrouble,
      )
    }
  }

  const setArchived = (current: HabitRead, archived: boolean) => {
    void run(
      'archive',
      async () => {
        await api.updateHabit(current.id, { archived })
        return archived
          ? copy.habits.archivedNote(current.title)
          : copy.habits.broughtBack(current.title)
      },
      // Bringing a habit back counts toward the 20 active habits.
      archived ? copy.habits.saveTrouble : copy.habits.limit(MAX_ACTIVE_HABITS),
    )
  }

  const onDelete = (current: HabitRead) => {
    void run(
      'delete',
      async () => {
        await api.deleteHabit(current.id)
        return copy.habits.deleted(current.title)
      },
      copy.habits.saveTrouble,
    )
  }

  const closeConfirm = () => {
    setConfirming(false)
    // Put focus back where it was, so keyboard users don't lose their place.
    requestAnimationFrame(() => deleteRef.current?.focus())
  }

  const heading = habit
    ? copy.editor.editTitle(habit.title)
    : owner.parentMode
      ? copy.editor.addFor(owner.member.nickname)
      : copy.editor.addTitle

  return (
    <main className="page">
      <BackLink owner={owner} />
      <ParentModeBanner owner={owner} />

      <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby="editor-title">
        <h1 id="editor-title" className={styles.heading}>
          {heading}
        </h1>

        <TextField
          ref={titleRef}
          id="habit-title"
          label={copy.editor.title}
          hint={copy.editor.titleHint}
          error={fieldError?.field === 'title' ? fieldError.message : null}
          value={form.title}
          maxLength={TITLE_MAX}
          autoComplete="off"
          required
          onChange={(event) => update({ title: event.target.value })}
        />

        <TextField
          ref={goalRef}
          id="habit-goal"
          label={copy.editor.goal}
          labelNote={copy.editor.optional}
          hint={copy.editor.goalHint}
          error={fieldError?.field === 'goalNote' ? fieldError.message : null}
          value={form.goalNote}
          maxLength={GOAL_MAX}
          autoComplete="off"
          onChange={(event) => update({ goalNote: event.target.value })}
        />

        <div className={styles.group}>
          <p className={fieldStyles.label}>{copy.editor.howOften}</p>
          {habit === null ? (
            <Segmented
              label={copy.editor.howOften}
              options={[
                { id: 'daily', label: copy.editor.daily },
                { id: 'weekly', label: copy.editor.weekly },
              ]}
              value={form.frequency}
              onChange={(frequency) => update({ frequency })}
            />
          ) : (
            <>
              {/* HabitUpdate has no frequency: a habit stays daily or weekly (spec §4). */}
              <p className={styles.fixed}>
                {habit.frequency === 'weekly' ? copy.editor.weekly : copy.editor.daily}
              </p>
              <p className={fieldStyles.hint}>{copy.editor.howOftenFixed}</p>
            </>
          )}
        </div>

        {form.frequency === 'weekly' && (
          <FieldShell
            id="habit-target"
            label={copy.editor.timesPerWeek}
            hint={habit ? copy.editor.targetHint : undefined}
          >
            <select
              id="habit-target"
              className={fieldStyles.input}
              value={form.target}
              aria-describedby={habit ? 'habit-target-hint' : undefined}
              onChange={(event) => update({ target: Number(event.target.value) })}
            >
              {TARGETS.map((n) => (
                <option key={n} value={n}>
                  {copy.editor.times(n)}
                </option>
              ))}
            </select>
          </FieldShell>
        )}

        {trouble && <Notice tone="caution">{trouble}</Notice>}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={busy !== null}>
            {busy === 'save' ? copy.editor.saving : copy.editor.save}
          </Button>
          <ButtonLink variant="quiet" to={listPath}>
            {copy.editor.cancel}
          </ButtonLink>
        </div>

        {habit && (
          <div className={styles.manage}>
            {confirming ? (
              <ConfirmDialog
                title={copy.editor.confirmTitle(habit.title)}
                confirmLabel={copy.editor.confirmYes(habit.title)}
                confirmIcon="trash"
                cancelLabel={copy.editor.confirmNo(habit.title)}
                busy={busy !== null}
                onConfirm={() => onDelete(habit)}
                onCancel={closeConfirm}
              >
                {copy.editor.confirmText(habit.title)}
              </ConfirmDialog>
            ) : (
              <div className={styles.actions}>
                {habit.archived ? (
                  <Button
                    icon="archive"
                    onClick={() => setArchived(habit, false)}
                    disabled={busy !== null}
                  >
                    {copy.habits.bringBack}
                  </Button>
                ) : (
                  <Button
                    icon="archive"
                    onClick={() => setArchived(habit, true)}
                    disabled={busy !== null}
                  >
                    {copy.editor.archive}
                  </Button>
                )}
                <Button
                  ref={deleteRef}
                  variant="dangerOutline"
                  icon="trash"
                  onClick={() => setConfirming(true)}
                  disabled={busy !== null}
                >
                  {copy.editor.delete}
                </Button>
              </div>
            )}
          </div>
        )}
      </form>
    </main>
  )
}
