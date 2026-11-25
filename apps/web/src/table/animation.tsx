import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Card, GameAction, PlayerView } from '@belot/game-engine'
import {
  cardId,
  durationOf,
  effectiveSpeed,
  tableEvent,
  timingFor,
  stageQueue,
  type PresentationStage,
  type AnimationSpeed,
  type TableEvent,
  type TableTiming,
} from './animationPlan'
import { measureSources, type AnchorMap } from './animationGeometry'
import { animateTable } from './animationFlights'
import type { Lang } from '../store'
import { t } from '../i18n'
import './animation.css'

const seenOpenings = new WeakSet<object>()
export interface AnimationJob {
  id: string
  event: TableEvent
  timing: TableTiming
  before: AnchorMap
}
export interface TableAnimation {
  job: AnimationJob | null
  locked: boolean
  stage: PresentationStage
  speed: AnimationSpeed
  lang: Lang
  skip: () => void
  capture: (action?: GameAction) => void
}
interface Options {
  sessionId: string
  view: PlayerView
  opening: object | null
  speed: AnimationSpeed
  motion: boolean
  expert: boolean
  lang: Lang
}
/** The deadline releases local pacing even if CSS or an individual WAAPI animation fails. */
export function useTableAnimation({
  sessionId,
  view,
  opening,
  speed,
  motion,
  expert,
  lang,
}: Options): TableAnimation {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const preset = effectiveSpeed(speed, motion && !reduced, expert)
  const previousSpeed = useRef(preset)
  const timing = useMemo(() => timingFor(preset), [preset])
  const [job, setJob] = useState<AnimationJob | null>(null)
  const [stage, setStage] = useState<PresentationStage>('idle')
  const previous = useRef<{ id: string; view: PlayerView } | null>(null)
  const before = useRef<AnchorMap>(new Map())
  const serial = useRef(0)
  const skip = useCallback(() => setJob(null), [])
  const capture = useCallback(
    (action?: GameAction) => {
      const current = previous.current?.view
      if (preset === 'instant' || document.hidden || !current) return
      if (
        current.phase !== 'PLAYING_TRICK' &&
        current.phase !== 'FINAL_DEAL' &&
        current.phase !== 'NEXT_HAND'
      )
        return
      const root = document.querySelector('[data-animation-table]')
      if (root) before.current = measureSources(root, current, action)
    },
    [preset],
  )
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    const visibility = () => {
      if (document.hidden) skip()
    }
    window.addEventListener('resize', skip)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      query.removeEventListener('change', change)
      window.removeEventListener('resize', skip)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [skip])
  useLayoutEffect(() => {
    if (previousSpeed.current !== preset) skip()
    previousSpeed.current = preset
  }, [preset, skip])
  useLayoutEffect(() => {
    const prev = previous.current?.id === sessionId ? previous.current.view : null
    if (prev?.revision === view.revision) return
    previous.current = { id: sessionId, view }
    const fresh = !!opening && !seenOpenings.has(opening)
    if (opening) seenOpenings.add(opening)
    const event = tableEvent(prev, view, fresh)
    const measured = before.current
    before.current = new Map()
    setJob(
      event && preset !== 'instant' && !document.hidden
        ? {
            id: sessionId + '/' + view.revision + '/' + ++serial.current,
            event,
            timing,
            before: measured,
          }
        : null,
    )
  }, [sessionId, view, opening, preset, timing])
  useLayoutEffect(() => {
    if (!job) return
    const queue = stageQueue(job.event, job.timing)
    setStage(queue[0].stage)
    const timers = queue.slice(1).map((s) => window.setTimeout(() => setStage(s.stage), s.at))
    const deadline = window.setTimeout(
      () => {
        // Keep the arrived stack in place until the engine's following revision removes the trick.
        if (job.event.kind === 'play' && job.event.collect) setStage('arrived')
        else setJob((current) => (current === job ? null : current))
      },
      durationOf(job.event, job.timing),
    )
    return () => {
      clearTimeout(deadline)
      timers.forEach(clearTimeout)
    }
  }, [job])
  return {
    job,
    locked: !!job && stage !== 'arrived',
    stage: job ? stage : 'idle',
    speed: preset,
    lang,
    skip,
    capture,
  }
}
interface FlyingCard {
  key: string
  card?: Card
}
function flyingCards(event: TableEvent): FlyingCard[] {
  if (event.kind === 'deal')
    return [
      ...event.moves.map((move, i) => ({ key: 'deal-' + i, card: move.card })),
      ...event.existing.map((card) => ({ key: 'keep-' + cardId(card), card })),
    ]
  if (event.kind === 'play')
    return (event.collect?.plays ?? [event.played]).map((p) => ({ key: 'play-' + p.seat, card: p.card }))
  if (event.kind === 'clear') return event.seats.map((seat) => ({ key: 'clear-' + seat }))
  return []
}
export function AnimationLayer({
  animation,
  renderCard,
}: {
  animation: TableAnimation
  renderCard: (card: Card) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const job = animation.job
  useLayoutEffect(() => {
    if (!job || !ref.current) return
    return animateTable(ref.current, job)
  }, [job])
  const event = job?.event
  const collect = event?.kind === 'play' ? event.collect : undefined
  const cards = useMemo(
    () =>
      job &&
      flyingCards(job.event).map(({ key, card }) => (
        <div key={job.id + key} className="flying-card" data-flight={key}>
          {card ? (
            <div className="flight-flipper">
              <div className="flight-face">{renderCard(card)}</div>
              <div className="flight-reverse back-print" />
            </div>
          ) : (
            <div className="flight-reverse back-print" />
          )}
          {collect && key === 'play-' + collect.winner && <span className="flight-outline" />}
        </div>
      )),
    [job, collect, renderCard],
  )
  return (
    <div
      ref={ref}
      className="table-animation-layer"
      aria-hidden="true"
      data-animation-layer=""
      data-choreography={event?.kind ?? 'idle'}
      data-flight-stage={animation.stage}
      data-collecting={!!collect}
    >
      {cards}
      {collect && (
        <div className={'flight-points ' + collect.team} data-flight-points="">
          +{collect.points}
          <span>{t(animation.lang, collect.team)}</span>
        </div>
      )}
    </div>
  )
}
