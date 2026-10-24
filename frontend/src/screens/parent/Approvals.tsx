import { useEffect, useRef, useState } from 'react'
import { isApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import { usePolling, useResource, type LoadOptions } from '../../api/hooks'
import type { MemberRead, PrizeClaimRead, PrizeRead } from '../../api/types'
import { useActiveSession } from '../../auth/useSession'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GemIcon, Icon } from '../../components/Icon'
import { Loading } from '../../components/Loading'
import { Notice } from '../../components/Notice'
import { PrizeForm } from '../../components/PrizeForm'
import { copy } from '../../copy'
import {
  approvalLines,
  ownClaimsNote,
  prizesWithPendingClaims,
  type ApprovalLine,
} from '../../lib/parent'
import styles from './Approvals.module.css'

interface ApprovalsData {
  timezone: string
  members: MemberRead[]
  prizes: PrizeRead[]
  /** Pending claims only: what needs a decision, and which prizes can't be deleted yet. */
  claims: PrizeClaimRead[]
}

async function loadApprovals(options: LoadOptions): Promise<ApprovalsData> {
  const [family, members, prizes, claims] = await Promise.all([
    api.getFamily(options),
    api.listMembers(options),
    api.listPrizes(options),
    api.listClaims(options, { status: 'pending' }),
  ])
  return { timezone: family.timezone, members, prizes, claims }
}

type PrizeMode = { kind: 'edit' | 'delete'; id: string } | null
type PrizeButton = 'edit' | 'delete'
type Message = { tone: 'info' | 'caution'; text: string } | null

/**
 * Parent: Approvals & prizes. Pending claims with "Approve <member>’s <prize>" / "Not this
 * time"; a parent's own claim waits for the other parent unless they're the only one (REQ-026,
 * C5). Prizes can be added, edited and deleted; Delete is off while a claim waits (REQ-024).
 * Refreshes every 30 s in the background, so new claims show up (REQ-004, REQ-012).
 */
export function Approvals() {
  const me = useActiveSession()?.acting_member
  const approvals = useResource('approvals', loadApprovals)
  usePolling(approvals.reload)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [prizeMode, setPrizeMode] = useState<PrizeMode>(null)
  /** After Cancel or Keep, focus goes back to the button that opened the form or dialog. */
  const [refocus, setRefocus] = useState<PrizeMode>(null)
  const waitingHeading = useRef<HTMLHeadingElement>(null)
  const prizesHeading = useRef<HTMLHeadingElement>(null)

  // RequireParent renders this screen only for a parent who is checking in.
  if (!me) return null
  const data = approvals.data
  if (!data) {
    return approvals.loading ? (
      <Loading />
    ) : (
      <Notice
        tone="caution"
        actions={<Button onClick={() => void approvals.reload()}>{copy.parent.tryAgain}</Button>}
      >
        {copy.parent.loadTrouble}
      </Notice>
    )
  }

  const self = data.members.find((m) => m.id === me.id) ?? me
  const lines = approvalLines(data.claims, data.members, self, data.timezone)
  const locked = prizesWithPendingClaims(data.claims)

  /**
   * Runs one change, then re-reads everything; the server has the last word. Every action
   * button is disabled while `busy`, so only one runs at a time. Returns whether it worked.
   */
  const act = async (
    request: () => Promise<unknown>,
    done: string,
    conflict: string,
    focus?: HTMLHeadingElement | null,
  ): Promise<boolean> => {
    setBusy(true)
    setMessage(null)
    let ok = false
    try {
      await request()
      setMessage({ tone: 'info', text: done })
      ok = true
    } catch (error) {
      setMessage({ tone: 'caution', text: isApiError(error, 409) ? conflict : copy.parent.trouble })
    }
    await approvals.reload()
    setBusy(false)
    // The pressed button may be gone now; its section heading is the next sensible place.
    focus?.focus()
    return ok
  }

  const decide = (line: ApprovalLine, status: 'approved' | 'declined') =>
    void act(
      () => api.decideClaim(line.claim.id, status),
      status === 'approved' ? line.approved : line.declined,
      copy.approvals.alreadyDecided,
      waitingHeading.current,
    )

  const addPrize = (body: { title: string; gem_cost: number }) =>
    act(() => api.createPrize(body), copy.prizes.added(body.title), copy.parent.trouble)

  const savePrize = async (prize: PrizeRead, body: { title: string; gem_cost: number }) => {
    const ok = await act(
      () => api.updatePrize(prize.id, body),
      copy.prizes.saved(body.title),
      copy.parent.trouble,
      prizesHeading.current,
    )
    if (ok) setPrizeMode(null)
    return ok
  }

  const open = (kind: PrizeButton, id: string) => {
    setRefocus(null)
    setPrizeMode({ kind, id })
  }
  const close = (kind: PrizeButton, id: string) => {
    setPrizeMode(null)
    setRefocus({ kind, id })
  }

  const deletePrize = async (prize: PrizeRead) => {
    await act(
      () => api.deletePrize(prize.id),
      copy.prizes.deleted(prize.title),
      copy.prizes.stillWaiting(prize.title),
      prizesHeading.current,
    )
    setPrizeMode(null)
  }

  return (
    <>
      {message && (
        <Notice tone={message.tone} icon={message.tone === 'info' ? 'check' : 'info'}>
          {message.text}
        </Notice>
      )}

      <section className={styles.section} aria-labelledby="waiting-title">
        <h2 id="waiting-title" className={styles.sectionTitle} ref={waitingHeading} tabIndex={-1}>
          {copy.approvals.waiting(lines.length)}
        </h2>
        {lines.length === 0 ? (
          <p className={styles.empty}>{copy.approvals.nothingWaiting}</p>
        ) : (
          <ul className={styles.claims}>
            {lines.map((line) => (
              <li key={line.claim.id} className={styles.claim}>
                <div className={styles.who}>
                  <span className={styles.avatar} aria-hidden="true">
                    {line.emoji}
                  </span>
                  <div>
                    <h3 className={styles.claimTitle}>{line.title}</h3>
                    <p className={styles.meta}>{line.meta}</p>
                  </div>
                </div>
                {line.approve ? (
                  <div className={styles.decide}>
                    <Button
                      variant="primary"
                      icon="check"
                      disabled={busy}
                      onClick={() => decide(line, 'approved')}
                    >
                      {line.approve}
                    </Button>
                    <Button disabled={busy} onClick={() => decide(line, 'declined')}>
                      {copy.approvals.decline} <span className="sr-only">{line.declineFor}</span>
                    </Button>
                  </div>
                ) : (
                  <p className={styles.waitingOther}>
                    <Icon name="clock" size={20} />
                    <span>{copy.approvals.waitingOther}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>{ownClaimsNote(self, data.members)}</p>
      </section>

      <section className={styles.section} aria-labelledby="prizes-title">
        <h2 id="prizes-title" className={styles.sectionTitle} ref={prizesHeading} tabIndex={-1}>
          {copy.prizes.title}
        </h2>
        {data.prizes.length === 0 ? (
          <p className={styles.empty}>{copy.prizes.none}</p>
        ) : (
          <ul className={styles.prizes}>
            {data.prizes.map((prize) => (
              <li key={prize.id} className={styles.prize}>
                {prizeMode?.id === prize.id && prizeMode.kind === 'edit' ? (
                  <PrizeForm
                    prize={prize}
                    busy={busy}
                    onSubmit={(body) => savePrize(prize, body)}
                    onCancel={() => close('edit', prize.id)}
                  />
                ) : (
                  <PrizeRow
                    prize={prize}
                    waiting={locked.has(prize.id)}
                    busy={busy}
                    focus={refocus?.id === prize.id ? refocus.kind : null}
                    onEdit={() => open('edit', prize.id)}
                    onDelete={() => open('delete', prize.id)}
                  />
                )}
                {prizeMode?.id === prize.id && prizeMode.kind === 'delete' && (
                  <ConfirmDialog
                    title={copy.prizes.confirmTitle(prize.title)}
                    confirmLabel={copy.prizes.confirmYes(prize.title)}
                    confirmIcon="trash"
                    cancelLabel={copy.prizes.confirmNo(prize.title)}
                    busy={busy}
                    onConfirm={() => void deletePrize(prize)}
                    onCancel={() => close('delete', prize.id)}
                  >
                    {copy.prizes.confirmText}
                  </ConfirmDialog>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.addCard}>
          <PrizeForm busy={busy} onSubmit={addPrize} />
        </div>
      </section>
    </>
  )
}

interface PrizeRowProps {
  prize: PrizeRead
  waiting: boolean
  busy: boolean
  /** Which button takes focus back after its form or dialog closed. */
  focus: PrizeButton | null
  onEdit: () => void
  onDelete: () => void
}

/** A prize with its cost, Edit and Delete; Delete is off while a claim for it waits. */
function PrizeRow({ prize, waiting, busy, focus, onEdit, onDelete }: PrizeRowProps) {
  const editRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (focus === 'edit') editRef.current?.focus()
    if (focus === 'delete') deleteRef.current?.focus()
  }, [focus])

  return (
    <div className={styles.prizeRow}>
      <div className={styles.prizeInfo}>
        <h3 className={styles.prizeTitle}>{prize.title}</h3>
        <p className={styles.cost}>
          <GemIcon />
          <span>{copy.gems.count(prize.gem_cost)}</span>
        </p>
        {waiting && <p className={styles.meta}>{copy.prizes.claimWaiting}</p>}
      </div>
      <div className={styles.prizeActions}>
        <Button ref={editRef} size="sm" icon="edit" disabled={busy} onClick={onEdit}>
          {copy.prizes.edit} <span className="sr-only">{copy.prizes.forPrize(prize.title)}</span>
        </Button>
        <Button
          ref={deleteRef}
          size="sm"
          variant="dangerOutline"
          icon="trash"
          disabled={busy || waiting}
          onClick={onDelete}
        >
          {copy.prizes.delete} <span className="sr-only">{copy.prizes.forPrize(prize.title)}</span>
        </Button>
      </div>
    </div>
  )
}
