import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Crown, Layers2, UserRound } from 'lucide-react'
import { teamOf, type Bid, type PlayerView, type Seat } from '@belot/game-engine'
import { t, suits } from '../i18n'
import type { Lang } from '../store'
import { portraits, tableText } from './names'
import { usePlayerName, useTableRoom } from './roomContext'
import type { TableTiming } from './animationPlan'

function SeatAnnouncement({
  view,
  seat,
  lang,
  timing,
}: {
  view: PlayerView
  seat: Seat
  lang: Lang
  timing: TableTiming
}) {
  const [spoken, setSpoken] = useState<{ kind: Bid | 'belot'; at: number } | null>(null)
  const last = useRef(view)
  const displayTime = Math.max(950, timing.hold * 4)
  useEffect(() => {
    const prior = last.current
    last.current = view
    if (prior.revision === view.revision) return
    if (view.revision !== prior.revision + 1 || view.handNumber !== prior.handNumber) {
      setSpoken(null)
      return
    }
    const bid = view.bids.at(-1)
    if (bid?.seat === seat && view.bids.length > prior.bids.length)
      setSpoken({ kind: bid.bid, at: view.revision })
    else if (view.belots.length > prior.belots.length && view.belots.at(-1)?.seat === seat)
      setSpoken({ kind: 'belot', at: view.revision })
  }, [view, seat])
  useEffect(() => {
    if (spoken) {
      const id = setTimeout(() => setSpoken(null), displayTime)
      return () => clearTimeout(id)
    }
  }, [spoken, displayTime])
  if (!spoken) return null
  if (spoken.kind === 'belot')
    return <i key={spoken.at} className="seat-belot-announce" aria-hidden="true" />
  if (!['BIDDING', 'FINAL_DEAL'].includes(view.phase)) return null
  return (
    <span
      key={spoken.at}
      className={'spoken-bid spoken-' + spoken.kind}
      style={{ '--spoken-ms': displayTime + 'ms' } as CSSProperties}
    >
      {spoken.kind in suits && <i>{suits[spoken.kind as keyof typeof suits]}</i>}
      {t(lang, spoken.kind)}
    </span>
  )
}
export function CapturedPile({
  view,
  seat,
  lang,
  inspect,
}: {
  view: PlayerView
  seat: Seat
  lang: Lang
  inspect: () => void
}) {
  const count = view.tricks.filter((tr) => tr.winner === seat).length
  const name = usePlayerName(lang)
  return (
    <button
      type="button"
      className={'captured-pile' + (count ? ' filled' : '')}
      onClick={inspect}
      title={tableText(lang, 'tricksWon') + ' · ' + count}
      aria-label={name(seat) + ' · ' + tableText(lang, 'tricksWon') + ' ' + count}
    >
      <span data-anim-pile={seat} className="pile-cards" aria-hidden="true">
        {count ? (
          Array.from({ length: Math.min(count, 5) }, (_, i) => (
            <i key={i} className="back-print" style={{ '--layer': i } as CSSProperties} />
          ))
        ) : (
          <Layers2 size={14} />
        )}
      </span>
      <b>{count}</b>
    </button>
  )
}
export function Station({
  seat,
  view,
  lang,
  inspect,
  timing,
  revealedWinner,
}: {
  seat: Seat
  view: PlayerView
  lang: Lang
  inspect: () => void
  timing: TableTiming
  revealedWinner: boolean
}) {
  const mySeat = seat === 'south'
  const name = usePlayerName(lang)
  const player = useTableRoom()?.players[seat]
  const portraitSeat = player?.roomSeat ?? seat
  const seatLabel =
    (player?.roomSeat ?? seat) === 'south'
      ? tableText(lang, 'southSeat')
      : t(lang, player?.roomSeat ?? seat)
  const active = (view.phase === 'BIDDING' || view.phase === 'PLAYING_TRICK') && view.turn === seat
  const winning = revealedWinner && view.turn === seat
  const decidedHand = !!view.result && view.result.outcome !== 'tied'
  const winHand = (view.result?.outcome === 'made') === (teamOf(seat) === view.declaringTeam)
  const isMatchWinner = !!view.winner && view.winner === teamOf(seat)
  const count = view.counts[seat]
  return (
    <section
      className={
        'station pos-' +
        seat +
        ' team-' +
        teamOf(seat) +
        (active ? ' is-active' : '') +
        (winning ? ' took-trick' : '') +
        (decidedHand ? (winHand ? ' won-hand' : ' lost-hand') : '') +
        (isMatchWinner ? ' won-match' : '')
      }
      aria-label={name(seat) + ' · ' + seatLabel}
    >
      <div className="station-id">
        <div className="portrait-ring" data-anim-seat={seat}>
          <div className="portrait-disc">
            {mySeat || player?.human ? (
              <UserRound />
            ) : (
              <img
                src={portraits[portraitSeat === 'south' ? 'north' : portraitSeat]}
                alt=""
                draggable={false}
              />
            )}
          </div>
          {view.dealer === seat && (
            <span className="dealer-chip" title={t(lang, 'dealer')} aria-label={t(lang, 'dealer')}>
              D
            </span>
          )}
          {isMatchWinner && <Crown className="winner-crown" size={18} />}
        </div>
        <div className="station-name">
          <strong title={name(seat)}>{name(seat)}</strong>
          <small>
            <span aria-hidden="true" className="team-mark" />
            {player?.human && !player.connected
              ? lang === 'bg'
                ? 'Извън линия'
                : 'Disconnected'
              : mySeat
                ? player
                  ? t(lang, 'south')
                  : seatLabel
                : t(lang, seat === 'north' ? 'partner' : 'opponent')}
          </small>
        </div>
      </div>
      {!mySeat && (
        <div className="fan-and-pile">
          <div
            className="opponent-fan"
            data-anim-hand={seat}
            aria-label={t(lang, 'hidden') + ' · ' + count}
          >
            {Array.from({ length: count }, (_, i) => (
              <i
                className="back-print"
                data-anim-back=""
                key={i}
                style={
                  {
                    '--index': i,
                    '--tilt': (i - (count - 1) / 2) * 5 + 'deg',
                    '--drop': Math.abs(i - (count - 1) / 2) * 1.55 + 'px',
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <CapturedPile view={view} seat={seat} lang={lang} inspect={inspect} />
        </div>
      )}
      <SeatAnnouncement view={view} seat={seat} lang={lang} timing={timing} />
    </section>
  )
}
