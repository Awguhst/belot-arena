import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Award,
  Check,
  ChevronRight,
  Crown,
  Flag,
  Gem,
  Layers,
  ListOrdered,
  SkipForward,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { BELOT_BONUS, emptyPoints, teamOf, type PlayerView, type Team } from '@belot/game-engine'
import type { Lang } from '../store'
import { declarationName, suits, t } from '../i18n'
import { timingFor, type AnimationSpeed as Speed } from './animationPlan'
import { roomReturnText, roomTeamNumber, usePlayerName, useTableRoom } from './roomContext'
import {
  capturedPoints,
  newPublicNotices,
  scoreRows,
  type LedgerRow,
  type MatchSummary,
  type PublicNotice,
} from './rewardModel'
import './rewards.css'

interface BaseProps {
  view: PlayerView
  lang: Lang
}
interface AnimatedProps extends BaseProps {
  speed: Speed
}
const terms = {
  matchScore: ['Резултат', 'Match score'],
  cardPoints: ['Точки от карти', 'Card points'],
  lastTrick: ['Последно десет', 'Last trick'],
  declarations: ['Спечелени анонси', 'Accepted declarations'],
  belots: ['Белот', 'Belots'],
  capotBonus: ['Капо', 'Capot'],
  noTrumpBonus: ['Удвояване при без коз', 'No Trumps doubling'],
  raw: ['Общо точки в ръката', 'Total hand points'],
  multiplier: ['Множител', 'Contract multiplier'],
  hangingBefore: ['Висящи от преди', 'Carried into hand'],
  hangingAwarded: ['Спечелени висящи точки', 'Carried points won'],
  hangingAfter: ['Остават висящи', 'Carried forward'],
  awarded: ['Записани точки', 'Match points awarded'],
  provisional: ['Заявен анонс', 'Pending declaration'],
  resolved: ['Решени анонси', 'Declarations settled'],
  established: ['Договорът е избран', 'Contract set'],
  scoreDetail: ['Точкуване', 'Score breakdown'],
  handsPlayed: ['Ръце', 'Hands played'],
  handsWon: ['Спечелени ръце', 'Hands won'],
  tricksWon: ['Наши взятки', 'Our tricks'],
  skip: ['Пропусни броенето', 'Skip count'],
  victory: ['Победа!', 'Victory!'],
  defeat: ['Край на мача', 'Match complete'],
  awardedScore: ['Резултат след ръката', 'Match score after hand'],
  newDeal: ['Ново раздаване', 'Redeal'],
  livePoints: ['Точки в ръката', 'Hand points so far'],
  announced: ['Заявени анонси', 'Pending declarations'],
  matchReview: ['Преглед на мача', 'Review match'],
  playAgain: ['Играй отново', 'Play again'],
  home: ['Към залата', 'Return to lobby'],
  scoreSheet: ['Резултат от раздаването', 'Hand score'],
  declaredBy: ['Обявил', 'Declared by'],
  draw: ['Равни точки', 'Tied hand'],
  made: ['Изкаран договор', 'Contract made'],
  failed: ['Вътре', 'Contract failed'],
  split: ['Двата отбора записват своите закръглени точки.', 'Both teams record their rounded share.'],
  sweep: ['Защитата записва целия сбор.', 'The defending team takes the full hand.'],
  doubledSweep: [
    'Победителят записва целия умножен сбор.',
    'The winning team takes the full multiplied hand.',
  ],
  tiedCarry: ['Делът на обявилия отбор остава висящ.', 'The declaring team’s share carries forward.'],
  doubleCarry: ['Целият умножен сбор остава висящ.', 'The full multiplied hand carries forward.'],
  inspect: ['Преглед на точките', 'Inspect scores'],
} as const
const word = (lang: Lang, key: keyof typeof terms) => terms[key][lang === 'bg' ? 0 : 1]
const teams = ['us', 'them'] as const

interface CountState {
  revealed: number
  skipped: boolean
  animate: boolean
  skip: () => void
}
const settled: CountState = { revealed: Infinity, skipped: false, animate: false, skip: () => {} }
const ScoreSequence = createContext<CountState>(settled)

/** Reveals an already committed score. This timeline never sends a command to the match. */
export function RewardPresentation({
  view,
  speed,
  sessionId,
  children,
}: {
  view: PlayerView
  speed: Speed
  sessionId: string
  children: ReactNode
}) {
  const previous = useRef({
    sessionId,
    revision: view.revision,
    hand: view.handNumber,
    hasResult: !!view.result,
  })
  const [count, setCount] = useState<{ revision: number; step: number; skipped: boolean } | null>(null)
  const length = view.result ? scoreRows(view.result, !!view.declarations.length).length : 0
  const duration = timingFor(speed, true).score
  useLayoutEffect(() => {
    const p = previous.current
    const fresh =
      p.sessionId === sessionId &&
      p.hand === view.handNumber &&
      p.revision + 1 === view.revision &&
      !p.hasResult &&
      !!view.result
    previous.current = {
      sessionId,
      revision: view.revision,
      hand: view.handNumber,
      hasResult: !!view.result,
    }
    if (fresh && duration) setCount({ revision: view.revision, step: 0, skipped: false })
    else if (!view.result || p.sessionId !== sessionId || p.revision !== view.revision) setCount(null)
  }, [view.revision, view.handNumber, !!view.result, sessionId, duration])
  const visible = count?.revision === view.revision ? count.step : Infinity
  useEffect(() => {
    if (visible >= length) return
    if (!duration) {
      setCount(null)
      return
    }
    const advance = () => setCount((last) => (last ? { ...last, step: last.step + 1 } : null))
    const timer = window.setTimeout(advance, Math.max(25, duration * 0.27))
    return () => window.clearTimeout(timer)
  }, [visible, length, duration])
  useEffect(() => {
    const stop = () => {
      if (document.hidden) setCount(null)
    }
    document.addEventListener('visibilitychange', stop)
    return () => document.removeEventListener('visibilitychange', stop)
  }, [])
  return (
    <ScoreSequence.Provider
      key={sessionId}
      value={{
        revealed: duration ? visible : Infinity,
        skipped: !!count?.skipped,
        animate: !!count && count.revision === view.revision && !count.skipped && duration > 0,
        skip: () => setCount({ revision: view.revision, step: Infinity, skipped: true }),
      }}
    >
      {children}
    </ScoreSequence.Provider>
  )
}

function Counter({ value, duration }: { value: number; duration: number }) {
  const label = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = label.current!
    const start = Number(element.textContent || value)
    if (!duration || value <= start) {
      element.textContent = String(value)
      return
    }
    let frame = 0
    let displayed = start
    const startTime = performance.now()
    function tick(now: number) {
      const progress = Math.min(1, (now - startTime) / duration)
      const next = Math.round(start + (value - start) * (1 - (1 - progress) ** 3))
      if (next !== displayed) {
        displayed = next
        element.textContent = String(next)
      }
      if (next !== value) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])
  return <span ref={label} />
}
function useMatchScore(view: PlayerView) {
  const { revealed, skipped } = useContext(ScoreSequence)
  const pending = view.result && revealed < scoreRows(view.result, !!view.declarations.length).length
  return {
    score: pending
      ? {
          us: view.scores.us - view.result!.awarded.us,
          them: view.scores.them - view.result!.awarded.them,
        }
      : view.scores,
    skipped,
  }
}
function RawCounter({ team, value, duration }: { team: Team; value: number; duration: number }) {
  const prev = useRef(value)
  const [arrival, setArrival] = useState(0)
  useLayoutEffect(() => {
    if (value > prev.current) setArrival((key) => key + 1)
    if (value < prev.current) setArrival(0)
    prev.current = value
  }, [value])
  return (
    <span data-points-target={team} className={'rw-raw-' + team}>
      {arrival > 0 && duration > 0 && <i key={arrival} aria-hidden="true" className="rw-points-flash" />}
      <Counter value={value} duration={duration} />
    </span>
  )
}
export function ScoreHUD({
  view,
  lang,
  speed,
  onBreakdown,
}: { onBreakdown?: () => void } & AnimatedProps) {
  const room = useTableRoom()
  const { score, skipped } = useMatchScore(view)
  const raw = capturedPoints(view)
  const duration = timingFor(speed, true).score
  const content = (
    <>
      <span className="rw-hud-heading">
        <span>{word(lang, 'matchScore')}</span>
        <span>
          {t(lang, 'to')} {view.target}
        </span>
      </span>
      <span className="rw-hud-teams">
        {teams.map((team) => (
          <span
            key={team}
            className={'rw-hud-team rw-' + team}
            data-room-team={roomTeamNumber(team, room)}
          >
            <span>
              <i aria-hidden="true" />
              {t(lang, team)}
            </span>
            <b>
              <Counter value={score[team]} duration={skipped ? 0 : duration} />
            </b>
          </span>
        ))}
      </span>
      <span className="rw-raw-line">
        <RawCounter team="us" value={raw.us} duration={duration} />
        <span>{word(lang, 'cardPoints')}</span>
        <RawCounter team="them" value={raw.them} duration={duration} />
      </span>
    </>
  )
  return onBreakdown ? (
    <button
      className="scoreboard rw-score-hud"
      onClick={onBreakdown}
      title={word(lang, 'inspect')}
      aria-label={word(lang, 'inspect')}
    >
      {content}
    </button>
  ) : (
    <div className="scoreboard rw-score-hud" aria-label={word(lang, 'matchScore')}>
      {content}
    </div>
  )
}

function Ledger({
  lang,
  rows,
  visible = Infinity,
}: {
  lang: Lang
  rows: LedgerRow[]
  visible?: number
}) {
  return (
    <table className="rw-ledger">
      <thead>
        <tr>
          <th scope="col">{word(lang, 'scoreDetail')}</th>
          {teams.map((team) => (
            <th scope="col" key={team}>
              {t(lang, team)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.key}
            className={'rw-row-' + row.key + (i < visible ? ' rw-revealed' : ' rw-concealed')}
            aria-hidden={i >= visible || undefined}
          >
            <th scope="row">{word(lang, row.key)}</th>
            {'points' in row ? (
              teams.map((team) => <td key={team}>{row.points[team]}</td>)
            ) : (
              <td colSpan={2} className="rw-shared">
                {row.key === 'multiplier' ? '×' : ''}
                {row.value}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
function Allocation({ view, lang }: BaseProps) {
  const result = view.result
  if (!result) return null
  const key =
    result.outcome === 'tied'
      ? result.multiplier > 1
        ? 'doubleCarry'
        : 'tiedCarry'
      : result.multiplier > 1
        ? 'doubledSweep'
        : result.outcome === 'failed'
          ? 'sweep'
          : 'split'
  return <p className="rw-allocation">{word(lang, key)}</p>
}
export function ScoreBreakdown({ view, lang }: BaseProps) {
  const name = usePlayerName(lang)
  if (view.result)
    return (
      <div className="rw-detail">
        <Ledger rows={scoreRows(view.result, !!view.declarations.length)} lang={lang} />
        <Allocation view={view} lang={lang} />
      </div>
    )
  const belots = emptyPoints()
  for (const belot of view.belots) belots[teamOf(belot.seat)] += BELOT_BONUS
  const rows: LedgerRow[] = [{ key: 'cardPoints', points: capturedPoints(view) }]
  if (view.tricks.length > 0) rows.push({ key: 'declarations', points: view.declarationPoints })
  if (belots.us || belots.them) rows.push({ key: 'belots', points: belots })
  if (view.hanging) rows.push({ key: 'hangingBefore', value: view.hanging })
  return (
    <div className="rw-detail">
      <h3>{word(lang, 'livePoints')}</h3>
      <Ledger rows={rows} lang={lang} />
      {view.tricks.length === 0 && !!view.declarations.length && (
        <div className="rw-provisional-list">
          <strong>{word(lang, 'announced')}</strong>
          {view.declarations.map((a) => (
            <p key={a.seat + a.declaration.id}>
              {name(a.seat)} · {declarationName(lang, a.declaration)} · {a.declaration.points}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function noticeText(
  lang: Lang,
  notice: PublicNotice,
  name: ReturnType<typeof usePlayerName>,
): [string, string] {
  switch (notice.kind) {
    case 'contract':
      return [
        suits[notice.contract] +
          ' ' +
          t(lang, notice.contract) +
          (notice.multiplier > 1 ? ' ×' + notice.multiplier : ''),
        word(lang, 'established'),
      ]
    case 'declaration':
      return [
        declarationName(lang, notice.declaration) + ' · ' + notice.declaration.points,
        name(notice.seat) + ' · ' + word(lang, 'provisional'),
      ]
    case 'belot':
      return [t(lang, 'belots') + ' ' + suits[notice.suit] + ' +' + BELOT_BONUS, name(notice.seat)]
    case 'resolved':
      return [
        word(lang, 'resolved'),
        t(lang, 'us') + ' +' + notice.points.us + ' · ' + t(lang, 'them') + ' +' + notice.points.them,
      ]
    default:
      return [t(lang, notice.kind) + ' ×' + (notice.kind === 'contra' ? 2 : 4), name(notice.seat)]
  }
}
export function TableAnnouncements({ view, lang, speed }: AnimatedProps) {
  const name = usePlayerName(lang)
  const previous = useRef(view)
  const [queue, setQueue] = useState<{ id: string; entries: PublicNotice[] }[]>([])
  const revision = view.revision
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = view
    if (before === view || before.revision === revision) return
    if (
      document.hidden ||
      before.handNumber !== view.handNumber ||
      before.revision + 1 !== revision ||
      !!view.result
    ) {
      setQueue([])
      return
    }
    const entries = newPublicNotices(before, view)
    if (entries.length) setQueue((q) => [...q, { id: String(revision), entries }])
  }, [view])
  const first = queue[0]
  useEffect(() => {
    if (!first) return
    const timer = window.setTimeout(
      () => setQueue((q) => q.slice(1)),
      Math.max(1150, timingFor(speed, true).points * 1.9),
    )
    return () => window.clearTimeout(timer)
  }, [first, speed])
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setQueue([])
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])
  return (
    <div className="rw-notice-stack" data-rw-speed={speed} role="status" aria-live="polite">
      {first?.entries.map((notice, index) => {
        const [title, caption] = noticeText(lang, notice, name)
        const Icon =
          notice.kind === 'belot'
            ? Crown
            : notice.kind === 'resolved'
              ? Check
              : notice.kind === 'declaration'
                ? Sparkles
                : notice.kind === 'contract'
                  ? Flag
                  : Gem
        return (
          <div className={'rw-notice rw-notice-' + notice.kind} key={first.id + '-' + index}>
            <Icon size={17} />
            <span>
              <strong>{title}</strong>
              <small>{caption}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface ResultProps extends AnimatedProps {
  onNext: () => void
  onReview?: () => void
  onAgain?: () => void
  onLobby: () => void
  matchStats?: MatchSummary
}
export function HandResult({
  view,
  lang,
  speed,
  onNext,
  onReview,
  onAgain,
  onLobby,
  matchStats,
}: ResultProps) {
  const name = usePlayerName(lang)
  const room = useTableRoom()
  const count = useContext(ScoreSequence)
  const { score, skipped } = useMatchScore(view)
  const [detailed, setDetailed] = useState(false)
  const region = useRef<HTMLElement>(null)
  useEffect(() => {
    if (region.current && !document.querySelector('dialog[open]'))
      region.current.focus({ preventScroll: true })
  }, [view.phase, view.handNumber])
  useEffect(() => setDetailed(false), [view.handNumber])
  if (view.phase !== 'NEXT_HAND' && view.phase !== 'MATCH_COMPLETE') return null
  const result = view.result
  if (!result)
    return (
      <section className="rw-result-wrap" data-rw-speed={speed}>
        <div className="rw-result rw-pass">
          <Layers size={27} />
          <h2>{word(lang, 'newDeal')}</h2>
          <p>{t(lang, 'allPassed')}</p>
          <button className="rw-primary" disabled={room?.blocked} onClick={onNext}>
            {t(lang, 'next')}
            <ChevronRight size={16} />
          </button>
          {room?.canReturnAtHandEnd && (
            <button className="rw-secondary" disabled={room.blocked} onClick={room.returnToRoom}>
              {roomReturnText(lang)}
            </button>
          )}
        </div>
      </section>
    )
  const rows = scoreRows(result, !!view.declarations.length)
  const running = count.revealed < rows.length && speed !== 'instant'
  const match = view.phase === 'MATCH_COMPLETE'
  const winning = view.winner === 'us'
  const Icon = match ? (winning ? Trophy : Flag) : result.capot ? Crown : Award
  const title = match
    ? word(lang, winning ? 'victory' : 'defeat')
    : word(lang, result.outcome === 'tied' ? 'draw' : result.outcome)
  const ledger = !match || running || detailed
  return (
    <div
      className={'rw-result-wrap' + (match ? ' rw-match-wrap' : '')}
      data-rw-speed={count.animate ? speed : 'instant'}
    >
      <section
        ref={region}
        tabIndex={-1}
        className={'rw-result ' + (match ? (winning ? 'rw-victory' : 'rw-defeat') : 'rw-hand')}
        role="region"
        aria-label={word(lang, match ? 'awardedScore' : 'scoreSheet')}
      >
        <header className="rw-result-head">
          <span className="rw-result-icon">
            <Icon size={25} />
          </span>
          <div>
            <small>
              {match ? t(lang, 'complete') : t(lang, 'hand') + ' ' + view.handNumber} ·{' '}
              {view.contract && suits[view.contract]} {view.contract && t(lang, view.contract)}{' '}
              {view.multiplier > 1 ? '×' + view.multiplier : ''}
            </small>
            <h2>{title}</h2>
          </div>
          {running && (
            <button
              className="rw-skip"
              onClick={count.skip}
              aria-label={word(lang, 'skip')}
              title={word(lang, 'skip')}
            >
              <SkipForward size={16} />
              <span>{word(lang, 'skip')}</span>
            </button>
          )}
        </header>
        <div className="rw-result-scroll">
          {match ? (
            <div className="rw-match-winner">{t(lang, winning ? 'won' : 'lost')}</div>
          ) : (
            view.bidder && (
              <p className="rw-declarer">
                {word(lang, 'declaredBy')} · {name(view.bidder)}{' '}
                <span>({t(lang, teamOf(view.bidder))})</span>
              </p>
            )
          )}
          {result.capot && (
            <div className="rw-capot">
              <Crown size={15} />
              {word(lang, 'capotBonus')} · {t(lang, result.capot)} +{result.capotBonus[result.capot]}
            </div>
          )}
          {ledger && (
            <>
              {match && view.bidder && (
                <p className="rw-declarer">
                  {word(lang, result.outcome === 'tied' ? 'draw' : result.outcome)} · {name(view.bidder)}
                </p>
              )}
              <Ledger lang={lang} rows={rows} visible={detailed ? Infinity : count.revealed} />
              <Allocation view={view} lang={lang} />
            </>
          )}
          <div className="rw-total-label">{word(lang, 'awardedScore')}</div>
          <div
            className={'rw-result-totals ' + (match ? 'rw-final-totals' : '')}
            aria-label={word(lang, 'awardedScore')}
          >
            {teams.map((team) => (
              <div
                className={'rw-total rw-' + team}
                key={team}
                data-room-team={roomTeamNumber(team, room)}
              >
                <span>
                  {room && (lang === 'bg' ? 'Отбор ' : 'Team ') + roomTeamNumber(team, room) + ' · '}
                  {t(lang, team)}
                </span>
                <strong>
                  <Counter value={score[team]} duration={skipped ? 0 : timingFor(speed, true).score} />
                </strong>
              </div>
            ))}
          </div>
          {match && matchStats && (
            <div className="rw-match-stats">
              {(
                [
                  ['handsPlayed', matchStats.hands],
                  ['handsWon', matchStats.won],
                  ['tricksWon', matchStats.tricks],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <strong>{value}</strong>
                  <span>{word(lang, key)}</span>
                </div>
              ))}
            </div>
          )}
          {match && !running && (
            <button
              className="rw-inspect"
              onClick={() => setDetailed((d) => !d)}
              aria-expanded={detailed}
            >
              <ListOrdered size={15} />
              {word(lang, 'scoreDetail')}
            </button>
          )}
        </div>
        <footer className="rw-result-actions">
          <button
            className="rw-primary"
            disabled={room?.blocked}
            onClick={match ? (room?.returnToRoom ?? onAgain) : onNext}
          >
            {match ? (room ? roomReturnText(lang) : word(lang, 'playAgain')) : t(lang, 'next')}
            <ChevronRight size={17} />
          </button>
          {onReview && (
            <button className="rw-secondary" onClick={onReview}>
              {match ? word(lang, 'matchReview') : t(lang, 'review')}
            </button>
          )}
          {!match && room?.canReturnAtHandEnd && (
            <button className="rw-secondary" disabled={room.blocked} onClick={room.returnToRoom}>
              {roomReturnText(lang)}
            </button>
          )}
          {match && !room && (
            <button className="rw-lobby" onClick={onLobby}>
              {word(lang, 'home')}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
