import { copy } from '../copy'
import type { PrizeOffer } from '../lib/gems'
import { Button } from './Button'
import { GemIcon } from './Icon'
import styles from './PrizeList.module.css'

interface PrizeListProps {
  offers: PrizeOffer[]
  busy: boolean
  onClaim: (offer: PrizeOffer) => void
}

/**
 * The family's prizes. One the member can afford gets "Claim <prize>"; otherwise the card
 * says how many gems are still to go, with no claim button (REQ-025).
 */
export function PrizeList({ offers, busy, onClaim }: PrizeListProps) {
  if (offers.length === 0) return <p className={styles.empty}>{copy.gemsPrizes.noPrizes}</p>
  return (
    <ul className={styles.grid}>
      {offers.map((offer) => (
        <li key={offer.prize.id} className={styles.card}>
          <h3 className={styles.title}>{offer.prize.title}</h3>
          <p className={styles.cost}>
            <GemIcon />
            <span>{copy.gems.count(offer.prize.gem_cost)}</span>
          </p>
          <ProgressBar value={offer.progress} />
          {offer.affordable ? (
            <Button variant="sun" icon="gift" block disabled={busy} onClick={() => onClaim(offer)}>
              {copy.gemsPrizes.claim(offer.prize.title)}
            </Button>
          ) : (
            <p className={styles.toGo}>{copy.gemsPrizes.toGo(offer.toGo)}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Decorative: the card's text already says what's left. SVG attributes only, for the CSP. */
function ProgressBar({ value }: { value: number }) {
  return (
    <svg className={styles.bar} width="100%" height="10" aria-hidden="true" focusable="false">
      <rect className={styles.track} width="100%" height="10" rx="5" />
      {value > 0 && <rect className={styles.fill} width={`${value * 100}%`} height="10" rx="5" />}
    </svg>
  )
}
