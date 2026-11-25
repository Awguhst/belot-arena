import { CONTRACTS, RANKS, RULESET, SEATS, SUITS } from './types'
import type {
  Bid,
  Card,
  Declaration,
  GameAction,
  GameEvent,
  GameState,
  MatchConfig,
  PlayerView,
  Seat,
} from './types'
import { emptyPoints, nextSeat, sameCard, shuffledDeck, teamOf } from './cards'
import {
  declarationsCompatible,
  detectDeclarations,
  recommendedDeclarations,
  resolveDeclarations,
} from './declarations'
import { determineTrickWinner, legalCardsFor } from './tricks'
import { calculateHandScore, calculateMatchResult } from './scoring'

const emptyHands = (): Record<Seat, Card[]> => ({ south: [], east: [], north: [], west: [] })
function clearHand() {
  return {
    contract: null,
    bidder: null,
    declaringTeam: null,
    multiplier: 1 as const,
    bids: [],
    passes: 0,
    trick: [],
    tricks: [],
    declarations: [],
    declarationPoints: emptyPoints(),
    belots: [],
    stock: [],
    hands: emptyHands(),
    originalHands: emptyHands(),
    result: null,
  }
}
/** Distributes whole packets to the dealer's right before starting the next round. */
function deal(state: GameState, deck: readonly Card[], packets: number[]) {
  const hands = { ...state.hands }
  let offset = 0
  for (const size of packets) {
    let seat = nextSeat(state.dealer)
    for (let n = 0; n < 4; n++) {
      hands[seat] = [...hands[seat], ...deck.slice(offset, offset + size)]
      offset += size
      seat = nextSeat(seat)
    }
  }
  return { hands, stock: deck.slice(offset) }
}
function finalDeal(state: GameState): GameState {
  const dealt = deal(state, state.stock, [3])
  return {
    ...state,
    ...dealt,
    originalHands: { ...dealt.hands },
    phase: 'PLAYING_TRICK',
    turn: nextSeat(state.dealer),
  }
}
function initialDeal(state: GameState, deck?: readonly Card[]): GameState {
  if (
    deck &&
    (deck.length !== 32 ||
      deck.some((card) => !SUITS.includes(card.suit) || !RANKS.includes(card.rank)) ||
      new Set(deck.map((card) => card.suit + card.rank)).size !== 32)
  )
    throw new Error('Invalid Belot deck')
  const fresh = { ...state, ...clearHand(), turn: nextSeat(state.dealer) }
  const dealt = deal(fresh, deck ?? shuffledDeck(state.seed, state.handNumber), [3, 2])
  const ready: GameState = { ...fresh, ...dealt, phase: 'BIDDING' }
  const contract = state.config.practiceContract
  return contract ? finalDeal({ ...ready, contract, bidder: 'south', declaringTeam: 'us' }) : ready
}
export function createMatch(config: MatchConfig = {}, seed = 1, deck?: readonly Card[]): GameState {
  if (!Number.isSafeInteger(seed)) throw new Error('Invalid shuffle seed')
  const target = config.target ?? 151,
    dealer = config.dealer ?? 'west'
  if (
    !Number.isSafeInteger(target) ||
    target <= 0 ||
    !SEATS.includes(dealer) ||
    (config.practiceContract !== undefined && !CONTRACTS.includes(config.practiceContract))
  )
    throw new Error('Invalid match configuration')
  const setup: GameState = {
    ...clearHand(),
    ruleset: RULESET,
    version: 1,
    seed,
    config: { ...config },
    revision: 0,
    dealer,
    turn: nextSeat(dealer),
    scores: emptyPoints(),
    hanging: 0,
    target,
    handNumber: 1,
    phase: 'MATCH_SETUP',
    winner: null,
  }
  return initialDeal({ ...setup, phase: 'INITIAL_DEAL' }, deck)
}
type Visible = GameState | PlayerView
const handFor = (state: Visible, seat: Seat): Card[] =>
  'hands' in state ? state.hands[seat] : state.seat === seat ? state.hand : []
export function getLegalCards(state: Visible, seat: Seat): Card[] {
  return state.phase === 'PLAYING_TRICK' && state.turn === seat && state.contract
    ? legalCardsFor(handFor(state, seat), state.trick, state.contract, seat)
    : []
}
export function legalBids(state: Visible, seat: Seat): Bid[] {
  if (state.phase !== 'BIDDING' || state.turn !== seat || ('seat' in state && state.seat !== seat))
    return []
  const start = state.contract ? CONTRACTS.indexOf(state.contract) + 1 : 0
  const bids: Bid[] = ['pass', ...CONTRACTS.slice(start)]
  if (state.contract && state.declaringTeam) {
    if (teamOf(seat) !== state.declaringTeam && state.multiplier === 1) bids.push('contra')
    if (teamOf(seat) === state.declaringTeam && state.multiplier === 2) bids.push('recontra')
  }
  return bids
}
export function getLegalActions(state: Visible, seat: Seat): GameAction[] {
  const revision = state.revision
  if (state.phase === 'BIDDING')
    return legalBids(state, seat).map((bid) => ({ type: 'bid', seat, bid, revision }))
  return getLegalCards(state, seat).map((card) => ({ type: 'play', seat, card, revision }))
}
const automatic = [
  'MATCH_SETUP',
  'INITIAL_DEAL',
  'FINAL_DEAL',
  'TRICK_RESOLUTION',
  'HAND_SCORING',
  'NEXT_HAND',
]
function selectDeclarations(state: GameState, seat: Seat, ids?: string[]): Declaration[] | null {
  if (!state.contract) return null
  if (ids !== undefined && !Array.isArray(ids)) return null
  if (state.tricks.length) return ids?.length ? null : []
  const hand = state.hands[seat]
  if (ids === undefined) return recommendedDeclarations(hand, state.contract)
  if (new Set(ids).size !== ids.length) return null
  const possible = detectDeclarations(hand, state.contract)
  const selected = possible.filter((d) => ids.includes(d.id))
  return selected.length === ids.length && declarationsCompatible(selected) ? selected : null
}
export function validateAction(state: GameState, action: GameAction): boolean {
  if (!action || state.revision !== action.revision) return false
  if (action.type === 'advance') return automatic.includes(state.phase)
  if (state.turn !== action.seat) return false
  if (action.type === 'bid') return legalBids(state, action.seat).includes(action.bid)
  if (
    action.type !== 'play' ||
    !action.card ||
    !getLegalCards(state, action.seat).some((c) => sameCard(c, action.card))
  )
    return false
  return (
    action.declarations === undefined ||
    selectDeclarations(state, action.seat, action.declarations) !== null
  )
}
function nextHand(state: GameState): GameState {
  const dealer = nextSeat(state.dealer)
  return {
    ...state,
    ...clearHand(),
    handNumber: state.handNumber + 1,
    phase: 'INITIAL_DEAL',
    dealer,
    turn: nextSeat(dealer),
  }
}
function submitBid(state: GameState, action: Extract<GameAction, { type: 'bid' }>): GameState {
  const { bid, seat } = action
  const next: GameState = {
    ...state,
    bids: [...state.bids, { bid, seat }],
    turn: nextSeat(seat),
    passes: bid === 'pass' ? state.passes + 1 : 0,
  }
  if (bid === 'pass') {
    if (!next.contract && next.passes === 4) return { ...next, phase: 'NEXT_HAND' }
    if (next.contract && next.passes === 3) return { ...next, phase: 'FINAL_DEAL' }
  } else if (bid === 'contra' || bid === 'recontra') {
    next.multiplier = bid === 'contra' ? 2 : 4
  } else {
    next.contract = bid
    next.bidder = seat
    next.declaringTeam = teamOf(seat)
    next.multiplier = 1
  }
  return next
}
function submitPlay(state: GameState, action: Extract<GameAction, { type: 'play' }>): GameState {
  const { seat } = action
  const hand = state.hands[seat]
  const card = hand.find((c) => sameCard(c, action.card))!
  const announcements = selectDeclarations(state, seat, action.declarations)!
  const declarations = announcements.length
    ? [...state.declarations, ...announcements.map((declaration) => ({ seat, declaration }))]
    : state.declarations
  let belots = state.belots
  const mate = card.rank === 'Q' ? 'K' : card.rank === 'K' ? 'Q' : null
  if (
    mate &&
    (state.contract === card.suit || state.contract === 'all-trumps') &&
    hand.some((c) => c.suit === card.suit && c.rank === mate) &&
    (!state.trick.length || state.trick[0]!.card.suit === card.suit || state.contract === card.suit)
  ) {
    belots = [...belots, { seat, suit: card.suit }]
  }
  const trick = [...state.trick, { seat, card }]
  const finished = trick.length === 4
  return {
    ...state,
    trick,
    declarations,
    belots,
    hands: { ...state.hands, [seat]: hand.filter((c) => !sameCard(card, c)) },
    phase: finished ? 'TRICK_RESOLUTION' : 'PLAYING_TRICK',
    turn: finished ? determineTrickWinner(trick, state.contract!) : nextSeat(seat),
  }
}
function advance(state: GameState, deck?: readonly Card[]): GameState {
  switch (state.phase) {
    case 'MATCH_SETUP':
      return { ...state, phase: 'INITIAL_DEAL' }
    case 'INITIAL_DEAL':
      return initialDeal(state, deck)
    case 'FINAL_DEAL':
      return finalDeal(state)
    case 'TRICK_RESOLUTION': {
      const winner = determineTrickWinner(state.trick, state.contract!)
      const tricks = [...state.tricks, { plays: state.trick, winner }]
      const declarationPoints =
        tricks.length === 1 ? resolveDeclarations(state.declarations) : state.declarationPoints
      return {
        ...state,
        tricks,
        declarationPoints,
        trick: [],
        turn: winner,
        phase: tricks.length === 8 ? 'HAND_SCORING' : 'PLAYING_TRICK',
      }
    }
    case 'HAND_SCORING': {
      const result = calculateHandScore(state)
      const scores = {
        us: state.scores.us + result.awarded.us,
        them: state.scores.them + result.awarded.them,
      }
      const winner = calculateMatchResult(scores, state.target, result.capot)
      return {
        ...state,
        result,
        scores,
        winner,
        hanging: result.hangingAfter,
        phase: winner ? 'MATCH_COMPLETE' : 'NEXT_HAND',
      }
    }
    case 'NEXT_HAND':
      return nextHand(state)
    default:
      throw new Error('No automatic transition in ' + state.phase)
  }
}
export function applyAction(state: GameState, action: GameAction, deck?: readonly Card[]): GameState {
  if (!validateAction(state, action)) throw new Error('Illegal action at revision ' + state.revision)
  const next =
    action.type === 'advance'
      ? advance(state, deck)
      : action.type === 'bid'
        ? submitBid(state, action)
        : submitPlay(state, action)
  return { ...next, revision: state.revision + 1 }
}
export function applyCommand(
  state: GameState,
  action: GameAction,
): { state: GameState; event: GameEvent } {
  const next = applyAction(state, action)
  return { state: next, event: { version: 1, revision: next.revision, action, phase: next.phase } }
}
export function replayGame(initial: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce((state, event) => {
    if (event.version !== 1) throw new Error('Unsupported replay version')
    const next = applyAction(state, event.action)
    if (event.revision !== next.revision || event.phase !== next.phase)
      throw new Error('Invalid replay event')
    return next
  }, initial)
}
/** An explicit allowlist keeps new internal fields private by default. */
export function getPlayerView(s: GameState, seat: Seat): PlayerView {
  return {
    seat,
    hand: s.hands[seat].map((c) => ({ ...c })),
    counts: {
      south: s.hands.south.length,
      north: s.hands.north.length,
      east: s.hands.east.length,
      west: s.hands.west.length,
    },
    ruleset: s.ruleset,
    revision: s.revision,
    target: s.target,
    handNumber: s.handNumber,
    phase: s.phase,
    dealer: s.dealer,
    turn: s.turn,
    contract: s.contract,
    bidder: s.bidder,
    declaringTeam: s.declaringTeam,
    multiplier: s.multiplier,
    passes: s.passes,
    bids: s.bids.map((b) => ({ ...b })),
    trick: s.trick.map(copyPlay),
    tricks: s.tricks.map((t) => ({ winner: t.winner, plays: t.plays.map(copyPlay) })),
    declarations: s.declarations.map((a) => ({
      seat: a.seat,
      declaration: { ...a.declaration, cards: a.declaration.cards.map((c) => ({ ...c })) },
    })),
    declarationPoints: { ...s.declarationPoints },
    belots: s.belots.map((b) => ({ ...b })),
    scores: { ...s.scores },
    hanging: s.hanging,
    result: s.result ? (JSON.parse(JSON.stringify(s.result)) as GameState['result']) : null,
    winner: s.winner,
  }
}
function copyPlay(play: GameState['trick'][number]) {
  return { seat: play.seat, card: { ...play.card } }
}
