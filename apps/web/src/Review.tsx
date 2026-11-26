import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  History,
  Layers3,
  ListChecks,
} from 'lucide-react'
import {
  applyAction,
  declarationsCompatible,
  detectDeclarations,
  determineTrickWinner,
  getLegalActions,
  getPlayerView,
  SEATS,
  type Bid,
  type Card,
  type GameAction,
  type GameState,
  type TeamPoints,
} from '@belot/game-engine'
import { evaluateDecision, explainDecision } from '@belot/bots'
import type { ReviewedHand } from './session'
import './Review.css'

type Language = 'en' | 'bg'
const words = {
  title: ['Анализ', 'Analysis'],
  intro: [
    'Прегледай обявите, решенията и точките от завършените раздавания.',
    'Revisit the auction, decisions and scoring of your completed hands.',
  ],
  empty: ['Все още няма завършени раздавания', 'Your first hand review awaits'],
  emptyHelp: [
    'Изиграй едно раздаване. Тук ще можеш да разгледаш всяка взятка и да сравниш ходовете си.',
    'Finish a hand to replay every trick and compare your decisions.',
  ],
  play: ['Играй', 'Play'],
  pick: ['Избери раздаване', 'Select a hand'],
  hand: ['Раздаване', 'Hand'],
  table: ['Маса', 'Table'],
  first: ['Начало', 'First action'],
  back: ['Предишно действие', 'Previous action'],
  next: ['Следващо действие', 'Next action'],
  last: ['Край', 'Last action'],
  position: ['Позиция в записа', 'Replay position'],
  deal: ['Раздаване на картите', 'Cards dealt'],
  bidding: ['Наддаване', 'Bidding'],
  finalDeal: ['Допълване до осем карти', 'Final three cards dealt'],
  trick: ['Взятка', 'Trick'],
  takes: ['Печели', 'Winner'],
  leads: ['Води', 'Leading'],
  scoring: ['Отчитане на точките', 'Scoring the hand'],
  finished: ['Край на раздаването', 'Hand complete'],
  decisions: ['Оценка на хода', 'Decision review'],
  limited: [
    'Оценката ползва само картите и обявите, известни на играча в този момент. Тя е ориентир за стратегията.',
    'The heuristic uses the player’s own cards and the information public at the time. Its grades are estimates.',
  ],
  reco: ['Препоръчан ход', 'Suggested action'],
  alternatives: ['Сравни позволените ходове', 'Compare legal choices'],
  branch: ['При този избор', 'With this choice'],
  before: [
    'Избери обява или карта от записа, за да сравниш решенията.',
    'Select a bid or card play in the replay to compare decisions.',
  ],
  played: ['Изигран ход', 'Recorded action'],
  attention: ['Ходове за преглед', 'Decisions to revisit'],
  none: [
    'Оценката не откри рискови твои ходове в това раздаване.',
    'The heuristic flagged none of your decisions in this hand.',
  ],
  cards: ['Начални ръце', 'Original hands'],
  hindsight: ['След раздаването', 'Hindsight'],
  decl: ['Пропуснати анонси', 'Missed declarations'],
  noMisses: [
    'Няма пропуснати анонси, съвместими с обявените.',
    'No additional declarations could coexist with those announced.',
  ],
  history: ['Наддаване и взятки', 'Auction and tricks'],
  dealt: ['Раздадени карти', 'Dealt cards'],
  ready: ['Готови за първата взятка', 'Ready for the first trick'],
  score: ['Точкуване', 'Score breakdown'],
  us: ['Ние', 'Us'],
  them: ['Те', 'Them'],
  captured: ['Карти от взятките', 'Captured cards'],
  lastTrick: ['Последно десет', 'Last trick'],
  declarations: ['Анонси', 'Declarations'],
  belots: ['Белот', 'Belot'],
  noTrumpBonus: ['Удвояване при без коз', 'No Trumps doubling'],
  capot: ['Капо', 'Capot'],
  raw: ['Общо сурови точки', 'Raw points'],
  claimed: ['Спечелени висящи точки', 'Hanging points claimed'],
  awarded: ['Записани точки', 'Points awarded'],
  hanging: ['Висящи точки', 'Hanging points'],
  after: ['След раздаването', 'After the hand'],
  beforeHand: ['Преди раздаването', 'Before the hand'],
  made: ['Изкарана игра', 'Contract made'],
  failed: ['Вътре', 'Contract failed'],
  tied: ['Висяща игра', 'Tied hand'],
  multiple: ['Множител', 'Multiplier'],
  south: ['Юг · Вие', 'South · You'],
  north: ['Север', 'North'],
  east: ['Изток', 'East'],
  west: ['Запад', 'West'],
  clubs: ['Спатия', 'Clubs'],
  diamonds: ['Каро', 'Diamonds'],
  hearts: ['Купа', 'Hearts'],
  spades: ['Пика', 'Spades'],
  'no-trumps': ['Без коз', 'No Trumps'],
  'all-trumps': ['Всичко коз', 'All Trumps'],
  pass: ['Пас', 'Pass'],
  contra: ['Контра', 'Contra'],
  recontra: ['Реконтра', 'Recontra'],
  recommended: ['Препоръчан', 'Recommended'],
  good: ['Добър', 'Good'],
  reasonable: ['Разумен', 'Reasonable'],
  questionable: ['Спорен', 'Questionable'],
  'potential-mistake': ['Възможна грешка', 'Potential mistake'],
  sequence: ['Поредица', 'Sequence'],
  carre: ['Каре', 'Four of a kind'],
  emptyTrick: ['Предстои първата карта', 'Waiting for the lead'],
  pts: ['т.', 'pts'],
  turn: ['На ход', 'To act'],
  contract: ['Договор', 'Contract'],
} as const
type Key = keyof typeof words
const symbol = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }
const cardText = (card: Card) => card.rank + symbol[card.suit]
const tr = (lang: Language, key: Key) => words[key][lang === 'bg' ? 0 : 1]
const bidText = (bid: Bid, lang: Language) =>
  (bid in symbol ? symbol[bid as Card['suit']] + ' ' : '') + tr(lang, bid)
function label(action: GameAction, lang: Language): string {
  return action.type === 'bid'
    ? bidText(action.bid, lang)
    : action.type === 'play'
      ? cardText(action.card)
      : tr(lang, 'deal')
}
function caption(frame: ReviewedHand['frames'][number], lang: Language): string {
  const { action, state } = frame
  if (!action) return tr(lang, 'deal')
  if (action.type !== 'advance') return tr(lang, action.seat) + ' · ' + label(action, lang)
  if (state.result) return tr(lang, 'finished')
  if (state.phase === 'BIDDING') return tr(lang, 'bidding')
  if (state.phase === 'HAND_SCORING') return tr(lang, 'scoring')
  if (state.tricks.length && !state.trick.length)
    return tr(lang, 'takes') + ' · ' + tr(lang, state.tricks.at(-1)!.winner)
  return tr(lang, 'finalDeal')
}
function cardClass(card: Card) {
  return card.suit === 'diamonds' || card.suit === 'hearts' ? 'rv-red' : ''
}
function CardChip({ card, lang }: { card: Card; lang: Language }) {
  return (
    <span className={'rv-chip ' + cardClass(card)} aria-label={card.rank + ' ' + tr(lang, card.suit)}>
      {cardText(card)}
    </span>
  )
}
interface ReviewProps {
  lang: Language
  hands: ReviewedHand[]
  initialId?: string
  onPlay?: () => void
}
export function Review({ lang, hands, initialId, onPlay }: ReviewProps) {
  const matchDate = useMemo(
    () =>
      new Intl.DateTimeFormat(lang, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [lang],
  )
  const t = (key: Key) => tr(lang, key)
  const [id, select] = useState(initialId)
  const newestFirst = useMemo(() => [...hands].reverse(), [hands])
  const hand = newestFirst.find((h) => h.id === id) ?? newestFirst[0]
  return (
    <section className="rv-page">
      <div className="rv-heading">
        <div className="page-intro">
          <h1 className="page-title">{t('title')}</h1>
          <p>{t('intro')}</p>
        </div>
        {hand && (
          <label className="rv-pick">
            <span>{t('pick')}</span>
            <select value={hand.id} onChange={(e) => select(e.target.value)}>
              {newestFirst.map((h) => (
                <option key={h.id} value={h.id}>
                  {matchDate.format(new Date(h.date))} · {t('hand')} {h.final.handNumber} ·{' '}
                  {h.final.contract && bidText(h.final.contract, lang)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {hand ? (
        <HandReview key={hand.id} hand={hand} lang={lang} />
      ) : (
        <div className="panel rv-empty">
          <div className="rv-empty-icon">
            <History size={29} />
          </div>
          <h2>{t('empty')}</h2>
          <p>{t('emptyHelp')}</p>
          {onPlay && (
            <button className="btn" onClick={onPlay}>
              {t('play')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
export default Review

function HandReview({ hand, lang }: { hand: ReviewedHand; lang: Language }) {
  const t = (key: Key) => tr(lang, key)
  const [position, move] = useState(0)
  const [alternative, compare] = useState<number | null>(null)
  const { frames, final } = hand
  const end = frames.length - 1
  const change = (index: number) => {
    move(index)
    compare(null)
  }
  const frame = frames[position]!,
    pre = frames[position - 1]?.state
  const state = frame.state,
    actual = frame.action
  const legal = pre && actual && actual.type !== 'advance' ? getLegalActions(pre, actual.seat) : []
  const choice = alternative === null ? actual : legal[alternative]
  const grade =
    pre && choice && choice.type !== 'advance'
      ? evaluateDecision(getPlayerView(pre, choice.seat), legal, choice)
      : null
  const altState = alternative !== null && pre && choice ? applyAction(pre, choice) : null
  const visible = altState ?? state
  const last = visible.tricks.at(-1)
  const trick = visible.trick.length
    ? visible.trick
    : frame.action?.type === 'advance' && last
      ? last.plays
      : []
  const trickWinner =
    trick.length && visible.contract ? determineTrickWinner(trick, visible.contract) : null
  const flags = useMemo(
    () =>
      frames.flatMap((f, i) => {
        if (!i || !f.action || f.action.type === 'advance' || f.action.seat !== 'south') return []
        const prior = frames[i - 1]!.state
        const view = getPlayerView(prior, 'south')
        const { grade } = evaluateDecision(view, getLegalActions(view, 'south'), f.action)
        return grade === 'questionable' || grade === 'potential-mistake' ? [{ i, grade }] : []
      }),
    [frames],
  )
  const firstBid = frames.findIndex((f) => f.action?.type === 'bid')
  return (
    <>
      <div className="rv-grid">
        <div>
          <section className="panel rv-panel">
            <div className="rv-row">
              <h2>{t('table')}</h2>
              <span className="rv-tag">
                {t('hand')} {state.handNumber} · {position + 1} / {frames.length}
              </span>
            </div>
            <div className="rv-felt">
              <div className="rv-felt-meta">
                {visible.contract ? bidText(visible.contract, lang) : t('bidding')}
                {visible.multiplier > 1 && ' ×' + visible.multiplier}
              </div>
              {trick.length ? (
                <div className="rv-trick">
                  {trick.map(({ card, seat }) => (
                    <div className={'rv-play rv-' + seat} key={seat}>
                      <span>{t(seat)}</span>
                      <div className={'rv-card ' + cardClass(card)}>
                        {card.rank}
                        <b>{symbol[card.suit]}</b>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rv-center">
                  <Layers3 size={28} />
                  {visible.phase === 'BIDDING' ? t('bidding') : t('emptyTrick')}
                </div>
              )}
              <span className="rv-felt-foot">
                {trickWinner
                  ? t(trick.length === 4 ? 'takes' : 'leads') + ' · ' + t(trickWinner)
                  : t('turn') + ' · ' + t(visible.turn)}
              </span>
            </div>
            <div className="rv-row rv-caption" aria-live="polite">
              <strong>
                {altState ? t('branch') + ' · ' + label(choice!, lang) : caption(frame, lang)}
              </strong>
            </div>
            <div className="rv-controls">
              <button
                title={t('first')}
                aria-label={t('first')}
                disabled={!position}
                onClick={() => change(0)}
              >
                <ChevronsLeft size={18} />
              </button>
              <button
                title={t('back')}
                aria-label={t('back')}
                disabled={!position}
                onClick={() => change(position - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                aria-label={t('position')}
                type="range"
                min="0"
                max={end}
                value={position}
                onChange={(e) => change(+e.target.value)}
              />
              <button
                title={t('next')}
                aria-label={t('next')}
                disabled={position === end}
                onClick={() => change(position + 1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                title={t('last')}
                aria-label={t('last')}
                disabled={position === end}
                onClick={() => change(end)}
              >
                <ChevronsRight size={18} />
              </button>
            </div>
          </section>
          <section className="panel rv-panel">
            <div className="rv-row">
              <h2>{t('decisions')}</h2>
              {grade && <span className={'rv-grade rv-grade-' + grade.grade}>{t(grade.grade)}</span>}
            </div>
            {grade ? (
              <>
                <p className="rv-advice">
                  <strong>
                    {t('reco')} · {label(grade.recommended.action, lang)}
                  </strong>
                  <br />
                  {explainDecision(grade.recommended.reason, lang)}
                </p>
                <label className="rv-pick">
                  {t('alternatives')}
                  <select
                    value={alternative ?? ''}
                    onChange={(e) => compare(e.target.value === '' ? null : +e.target.value)}
                  >
                    <option value="">
                      {t('played')} · {label(actual!, lang)}
                    </option>
                    {legal
                      .filter((a) => label(a, lang) !== label(actual!, lang))
                      .map((a) => (
                        <option value={legal.indexOf(a)} key={label(a, lang)}>
                          {label(a, lang)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            ) : (
              <p>{t('before')}</p>
            )}
            <p className="rv-note">{t('limited')}</p>
          </section>
        </div>
        <div>
          <section className="panel rv-panel">
            <h2>{t('history')}</h2>
            {firstBid >= 0 && (
              <div className="rv-bids">
                {frames.map(
                  (f, i) =>
                    f.action?.type === 'bid' && (
                      <button key={i} aria-pressed={position === i} onClick={() => change(i)}>
                        {t(f.action.seat)} · {bidText(f.action.bid, lang)}
                      </button>
                    ),
                )}
              </div>
            )}
            <div className="rv-tricks">
              {final.tricks.map((item, i) => {
                const mark = frames.findIndex(
                  (f) => f.state.phase === 'TRICK_RESOLUTION' && f.state.tricks.length === i,
                )
                return (
                  <button
                    key={i}
                    disabled={mark < 0}
                    aria-pressed={position === mark}
                    onClick={() => change(mark)}
                  >
                    <span>
                      {t('trick')} {i + 1}
                    </span>
                    <span>{item.plays.map((p) => cardText(p.card)).join('  ')}</span>
                    <span>{t(item.winner)}</span>
                  </button>
                )
              })}
            </div>
          </section>
          <section className="panel rv-panel">
            <h2>{t('attention')}</h2>
            {flags.length ? (
              <div className="rv-bids">
                {flags.map(({ i, grade }) => (
                  <button key={i} onClick={() => change(i)}>
                    {label(frames[i]!.action!, lang)} · {t(grade)}
                  </button>
                ))}
              </div>
            ) : (
              <p>{t('none')}</p>
            )}
          </section>
        </div>
      </div>
      <div className="rv-grid">
        <section className="panel rv-panel">
          <div className="rv-row">
            <h2>{t('cards')}</h2>
            <span className="rv-tag">{t('hindsight')}</span>
          </div>
          {SEATS.map((seat) => (
            <div key={seat} className="rv-hand">
              <strong>{t(seat)}</strong>
              <div>
                {final.originalHands[seat].map((card) => (
                  <CardChip key={cardText(card)} card={card} lang={lang} />
                ))}
              </div>
            </div>
          ))}
          <Misses state={final} lang={lang} />
        </section>
        <ScoreTable state={final} lang={lang} />
      </div>
    </>
  )
}
function Misses({ state, lang }: { state: GameState; lang: Language }) {
  if (!state.contract) return null
  const selected = state.declarations.filter((d) => d.seat === 'south').map((a) => a.declaration)
  const missed = detectDeclarations(state.originalHands.south, state.contract).filter((d) =>
    declarationsCompatible([...selected, d]),
  )
  return (
    <div className="rv-missed">
      <h3>
        <ListChecks size={18} />
        {tr(lang, 'decl')}
      </h3>
      {missed.length ? (
        <ul>
          {missed.map((d) => (
            <li key={d.id}>
              {tr(lang, d.kind)} · {d.cards.map(cardText).join(' ')} · {d.points} {tr(lang, 'pts')}
            </li>
          ))}
        </ul>
      ) : (
        <p>{tr(lang, 'noMisses')}</p>
      )}
    </div>
  )
}
function ScoreTable({ state, lang }: { state: GameState; lang: Language }) {
  const r = state.result
  if (!r) return null
  const t = (key: Key) => tr(lang, key)
  const rows: [Key, TeamPoints][] = [
    ['captured', r.cardPoints],
    ['lastTrick', r.lastTrick],
    ['declarations', r.declarations],
    ['belots', r.belots],
    ['noTrumpBonus', r.noTrumpBonus],
    ['capot', r.capotBonus],
    ['raw', r.raw],
    ['claimed', r.hangingAwarded],
    ['awarded', r.awarded],
  ]
  return (
    <section className="panel rv-panel">
      <div className="rv-row">
        <h2>{t('score')}</h2>
        <span className="rv-tag">
          {t(r.outcome)} · ×{r.multiplier}
        </span>
      </div>
      <table className="rv-scores">
        <thead>
          <tr>
            <td></td>
            <th scope="col">{t('us')}</th>
            <th scope="col">{t('them')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, points]) => (
            <tr className={key === 'raw' || key === 'awarded' ? 'rv-subtotal' : ''} key={key}>
              <th scope="row">{t(key)}</th>
              <td>{points.us}</td>
              <td>{points.them}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rv-note">
        {t('hanging')} · {t('beforeHand')} {r.hangingBefore} · {t('after')} {r.hangingAfter}
      </p>
    </section>
  )
}
