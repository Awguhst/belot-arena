import { memo } from 'react'
import { sameCard, type Card } from '@belot/game-engine'
import { suits } from '../i18n'

const courtArt: Partial<Record<Card['rank'], string>> = {
  J: '/art/jack.webp',
  Q: '/art/queen.webp',
  K: '/art/king.webp',
}
const six = [
  [20, 12],
  [80, 12],
  [20, 50],
  [80, 50],
  [20, 88],
  [80, 88],
]
const eight = [
  [20, 10],
  [80, 10],
  [20, 37],
  [80, 37],
  [20, 63],
  [80, 63],
  [20, 90],
  [80, 90],
]
const positions: Partial<Record<Card['rank'], number[][]>> = {
  '7': [...six, [50, 31]],
  '8': [...six, [50, 31], [50, 69]],
  '9': [...eight, [50, 50]],
  '10': [...eight, [50, 24], [50, 76]],
}
export const CardFace = memo(
  function CardFace({ card, points }: { card: Card; points?: number }) {
    const art = courtArt[card.rank],
      pips = positions[card.rank],
      pip = suits[card.suit]
    return (
      <span aria-hidden="true" className={'deck-face suit-' + card.suit}>
        <span className="deck-index">
          {card.rank}
          <i>{pip}</i>
        </span>
        {art ? (
          <span className="deck-portrait">
            <img src={art} alt="" draggable={false} />
          </span>
        ) : pips ? (
          <span className="deck-pips">
            {pips.map(([x, y]) => (
              <i
                key={x + '-' + y}
                style={{ left: x + '%', top: y + '%', rotate: y > 50 ? '180deg' : undefined }}
              >
                {pip}
              </i>
            ))}
          </span>
        ) : (
          <span className="deck-ace">
            <i>{pip}</i>
          </span>
        )}
        <span className="deck-index reversed">
          {card.rank}
          <i>{pip}</i>
        </span>
        {points !== undefined && <small className="deck-value">{points}</small>}
      </span>
    )
  },
  (previous, next) => previous.points === next.points && sameCard(previous.card, next.card),
)
