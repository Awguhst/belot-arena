import { CONTRACTS, type Bid, type GameAction, type PlayerView } from '@belot/game-engine'
import { Diamond, Spade, Ban } from 'lucide-react'
import { suits, t } from '../i18n'
import type { Lang } from '../store'
import { tableText } from './names'

export function ContractPip({ bid }: { bid: Bid }) {
  if (bid === 'no-trumps') return <Ban aria-hidden="true" />
  if (bid === 'all-trumps')
    return (
      <span className="four-pips" aria-hidden="true">
        <i>♠</i>
        <i>♥</i>
        <i>♦</i>
        <i>♣</i>
      </span>
    )
  return (
    <span aria-hidden="true" className={'single-pip pip-' + bid}>
      {bid in suits ? suits[bid as keyof typeof suits] : null}
    </span>
  )
}
export function Auction({
  view,
  lang,
  legal,
  locked,
  onBid,
}: {
  view: PlayerView
  lang: Lang
  legal: GameAction[]
  locked: boolean
  onBid: (bid: Bid) => void
}) {
  const available = (bid: Bid) => !locked && legal.some((a) => a.type === 'bid' && a.bid === bid)
  return (
    <section className="auction-console" aria-label={t(lang, 'auction')}>
      <div className="auction-title">
        <i />
        <Diamond aria-hidden="true" />
        <h2>{view.turn === 'south' ? tableText(lang, 'choose') : t(lang, 'auction')}</h2>
        <Diamond aria-hidden="true" />
        <i />
      </div>
      <div className="auction-suits">
        {CONTRACTS.map((bid) => (
          <button
            key={bid}
            type="button"
            data-bid={bid}
            aria-disabled={!available(bid)}
            onClick={() => onBid(bid)}
          >
            <ContractPip bid={bid} />
            <span>{t(lang, bid)}</span>
          </button>
        ))}
      </div>
      <div className="auction-modifiers">
        {(['pass', 'contra', 'recontra'] as const).map((bid, i) => (
          <button
            type="button"
            key={bid}
            data-bid={bid}
            aria-disabled={!available(bid)}
            onClick={() => onBid(bid)}
          >
            {i > 0 && <i>×{i === 1 ? '2' : '4'}</i>}
            {t(lang, bid)}
          </button>
        ))}
      </div>
    </section>
  )
}
