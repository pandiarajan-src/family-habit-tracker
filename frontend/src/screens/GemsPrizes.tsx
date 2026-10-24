import { useRef, useState } from 'react'
import { isApiError } from '../api/client'
import { api } from '../api/endpoints'
import { usePolling, useResource, type LoadOptions } from '../api/hooks'
import type {
  AdjustmentRead,
  GemTransactionRead,
  HabitRead,
  MemberRead,
  PrizeClaimRead,
  PrizeRead,
} from '../api/types'
import { useActiveSession } from '../auth/useSession'
import { BalanceCard } from '../components/BalanceCard'
import { Button } from '../components/Button'
import { ChangesList } from '../components/ChangesList'
import { ClaimList } from '../components/ClaimList'
import { GemHistory } from '../components/GemHistory'
import { Loading } from '../components/Loading'
import { Notice } from '../components/Notice'
import { Panel } from '../components/Panel'
import { PrizeList } from '../components/PrizeList'
import { copy } from '../copy'
import { familyDate } from '../lib/dates'
import { claimLine, historyLines, prizeOffers, type ClaimLine, type PrizeOffer } from '../lib/gems'
import { describeChanges } from '../lib/myDay'
import styles from './GemsPrizes.module.css'

interface GemsData {
  timezone: string
  today: string
  members: MemberRead[]
  /** Archived ones too, so history and changes can name them. */
  habits: HabitRead[]
  prizes: PrizeRead[]
  claims: PrizeClaimRead[]
  events: GemTransactionRead[]
  adjustments: AdjustmentRead[]
}

async function loadGems(memberId: string, options: LoadOptions): Promise<GemsData> {
  const family = await api.getFamily(options)
  const [members, habits, prizes, claims, events, adjustments] = await Promise.all([
    api.listMembers(options),
    api.listHabits(options, { member_id: memberId, include_archived: true }),
    api.listPrizes(options),
    api.listClaims(options, { member_id: memberId }),
    api.listGemTransactions(memberId, options),
    api.listAdjustments(options),
  ])
  return {
    timezone: family.timezone,
    today: familyDate(Date.now(), family.timezone),
    members,
    habits,
    prizes,
    claims,
    events,
    adjustments,
  }
}

/**
 * Gems & prizes for the acting member: balance with held gems (REQ-021), claims with their
 * status and "Cancel claim" (REQ-025, 026), prizes to claim or "N more gems to go!" (REQ-025),
 * gems earned and spent (REQ-018, 019, 021), and "Changes to my habits" (REQ-015).
 * Refreshes every 30 s in the background, so a parent's decision shows up (REQ-026).
 */
export function GemsPrizes() {
  const me = useActiveSession()?.acting_member
  const memberId = me?.id ?? ''
  const gems = useResource(`gems:${memberId}`, (options) => loadGems(memberId, options))
  usePolling(gems.reload)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [trouble, setTrouble] = useState<string | null>(null)
  const claimsHeading = useRef<HTMLHeadingElement>(null)

  // MemberLayout renders this screen only while someone is checking in.
  if (!me) return null
  const data = gems.data

  if (!data) {
    return (
      <main className="page">
        {gems.loading ? (
          <Loading />
        ) : (
          <Notice
            tone="caution"
            actions={<Button onClick={() => void gems.reload()}>{copy.gemsPrizes.tryAgain}</Button>}
          >
            {copy.gemsPrizes.loadTrouble}
          </Notice>
        )}
      </main>
    )
  }

  const self = data.members.find((m) => m.id === me.id) ?? me
  const parentCount = data.members.filter((m) => m.role === 'parent').length
  const claims = data.claims.map((c) => claimLine(c, self, parentCount, data.timezone))

  /**
   * Runs a claim or cancel, then re-reads everything; the server has the last word. Every
   * action button is disabled while `busy`, so only one runs at a time.
   */
  const act = async (request: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setNote(null)
    setTrouble(null)
    try {
      await request()
      setNote(done)
    } catch (error) {
      // 409: the balance moved (claim) or a parent decided first (cancel); the reload shows why.
      if (!isApiError(error, 409)) setTrouble(copy.gemsPrizes.claimTrouble)
    }
    await gems.reload()
    setBusy(false)
    // The button that was pressed may be gone now; the new claim state is under this heading.
    claimsHeading.current?.focus()
  }

  const claim = (offer: PrizeOffer) =>
    void act(() => api.claimPrize(offer.prize.id), copy.gemsPrizes.claimedNote(offer.prize.title))
  const cancel = (line: ClaimLine) =>
    void act(
      () => api.decideClaim(line.claim.id, 'cancelled'),
      copy.gemsPrizes.cancelledNote(line.claim.prize_title),
    )

  return (
    <main className="page">
      <h1 className="page-title">{copy.screens.gems}</h1>

      {note && <Notice icon="check">{note}</Notice>}
      {trouble && <Notice tone="caution">{trouble}</Notice>}

      <div className={styles.pair}>
        <BalanceCard balance={self.gem_balance} held={self.gems_held} />
        <Panel title={copy.gemsPrizes.claimsTitle} headingRef={claimsHeading}>
          <ClaimList lines={claims} busy={busy} onCancel={cancel} />
        </Panel>
      </div>

      <section className={styles.section} aria-labelledby="prizes-title">
        <h2 id="prizes-title" className={styles.sectionTitle}>
          {copy.gemsPrizes.prizesTitle}
        </h2>
        <PrizeList
          offers={prizeOffers(data.prizes, self.gem_balance)}
          busy={busy}
          onClaim={claim}
        />
      </section>

      <div className={styles.wide}>
        <Panel title={copy.gemsPrizes.historyTitle}>
          <GemHistory lines={historyLines(data.events, data.habits, data.claims, data.today)} />
        </Panel>
        <Panel title={copy.gemsPrizes.changesTitle}>
          <ChangesList
            lines={describeChanges(data.adjustments, data.members, data.habits, data.timezone)}
          />
        </Panel>
      </div>
    </main>
  )
}
