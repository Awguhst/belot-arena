import {
  cardPoints,
  nextSeat,
  teamOf,
  type Card,
  type Play,
  type PlayerView,
  type Seat,
} from '@belot/game-engine'

export type AnimationSpeed = 'cinematic' | 'normal' | 'fast' | 'instant'
const normal = {
  hover: 155,
  play: 310,
  deal: 225,
  stagger: 51,
  settle: 220,
  hold: 475,
  gather: 285,
  collect: 360,
  points: 690,
  turn: 190,
  score: 650,
  clear: 380,
  contract: 490,
}
export type TableTiming = Readonly<typeof normal>
export function effectiveSpeed(speed: AnimationSpeed, motion: boolean, expert = false): AnimationSpeed {
  if (!motion || speed === 'instant') return 'instant'
  return expert && speed !== 'fast' ? 'fast' : speed
}
function scaledTiming(factor: number): TableTiming {
  return Object.freeze(
    Object.fromEntries(Object.entries(normal).map(([key, ms]) => [key, Math.round(ms * factor)])),
  ) as TableTiming
}
const timings: Record<AnimationSpeed, TableTiming> = {
  cinematic: scaledTiming(1.4),
  normal: Object.freeze(normal),
  fast: scaledTiming(0.42),
  instant: scaledTiming(0),
}
/** All times are milliseconds. Bot deliberation uses its own preference and clock. */
export function timingFor(speed: AnimationSpeed, motion = true, expert = false): TableTiming {
  return timings[effectiveSpeed(speed, motion, expert)]
}
export const cardId = (c: Card) => c.suit + '-' + c.rank
export interface DealMove {
  seat: Seat
  slot: number
  card?: Card
}
export type TableEvent =
  | { kind: 'deal'; moves: DealMove[]; existing: Card[] }
  | {
      kind: 'play'
      played: Play
      collect?: { plays: Play[]; winner: Seat; points: number; team: 'us' | 'them' }
    }
  | { kind: 'clear'; seats: Seat[] }
  | { kind: 'contract' }

function dealEvent(view: PlayerView, previous?: PlayerView): TableEvent | null {
  const finalThree = previous?.phase === 'FINAL_DEAL'
  const packets = finalThree ? [3] : view.phase === 'BIDDING' ? [3, 2] : [3, 2, 3]
  const existing = finalThree ? previous.hand : []
  const before = new Set(existing.map(cardId))
  const own = view.hand.filter((c) => !before.has(cardId(c)))
  if (own.length !== packets.reduce((a, b) => a + b, 0)) return null
  let index = 0
  const moves: DealMove[] = []
  const counts = {
    south: existing.length,
    north: existing.length,
    east: existing.length,
    west: existing.length,
  }
  for (const packet of packets) {
    let seat = nextSeat(view.dealer)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < packet; j++)
        moves.push({ seat, slot: counts[seat]++, ...(seat === view.seat ? { card: own[index++] } : {}) })
      seat = nextSeat(seat)
    }
  }
  return { kind: 'deal', moves, existing }
}
/** Only consecutive public projections can produce movement. A jump or rewind snaps to the supplied view. */
export function tableEvent(
  previous: PlayerView | null,
  view: PlayerView,
  fresh = false,
): TableEvent | null {
  if (!previous) return fresh && view.revision === 0 ? dealEvent(view) : null
  if (view.revision !== previous.revision + 1) return null
  if (view.handNumber !== previous.handNumber) {
    if (view.phase !== 'INITIAL_DEAL') return null
    const seats = [...new Set(previous.tricks.map((trick) => trick.winner))]
    return seats.length ? { kind: 'clear', seats } : null
  }
  if (
    (previous.phase === 'INITIAL_DEAL' || previous.phase === 'FINAL_DEAL') &&
    (view.phase === 'BIDDING' || view.phase === 'PLAYING_TRICK')
  )
    return dealEvent(view, previous)
  if (view.phase === 'FINAL_DEAL' && previous.phase === 'BIDDING') return { kind: 'contract' }
  if (previous.phase === 'PLAYING_TRICK' && view.trick.length === previous.trick.length + 1) {
    const played = view.trick[view.trick.length - 1]
    if (view.phase === 'TRICK_RESOLUTION' && view.contract) {
      const contract = view.contract
      // In TRICK_RESOLUTION the authority has already placed the winner in turn.
      return {
        kind: 'play',
        played,
        collect: {
          plays: view.trick,
          winner: view.turn,
          team: teamOf(view.turn),
          points: view.trick.reduce((sum, p) => sum + cardPoints(p.card, contract), 0),
        },
      }
    }
    return { kind: 'play', played }
  }
  return null
}
export function durationOf(event: TableEvent, t: TableTiming): number {
  switch (event.kind) {
    case 'contract':
      return t.contract
    case 'clear':
      return t.clear
    case 'deal':
      return (event.moves.length - 1) * t.stagger + t.deal + t.settle
    case 'play':
      return event.collect ? t.play + t.hold + t.gather + t.collect + Math.round(t.points * 0.7) : t.play
  }
}
export type PresentationStage =
  | 'idle'
  | 'deal'
  | 'sort'
  | 'play'
  | 'winner'
  | 'gather'
  | 'collect'
  | 'bank'
  | 'clear'
  | 'contract'
  | 'arrived'
/** The effects in one accepted action share a clock, including the final play and its trick collection. */
export function stageQueue(
  event: TableEvent,
  t: TableTiming,
): { at: number; stage: PresentationStage }[] {
  if (event.kind === 'deal')
    return [
      { at: 0, stage: 'deal' },
      { at: durationOf(event, t) - t.settle, stage: 'sort' },
    ]
  if (event.kind !== 'play' || !event.collect) return [{ at: 0, stage: event.kind }]
  const gather = t.play + t.hold,
    collect = gather + t.gather
  return [
    { at: 0, stage: 'play' },
    { at: t.play, stage: 'winner' },
    { at: gather, stage: 'gather' },
    { at: collect, stage: 'collect' },
    { at: collect + t.collect, stage: 'bank' },
  ]
}
