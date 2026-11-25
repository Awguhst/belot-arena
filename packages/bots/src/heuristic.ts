import {
  CONTRACTS,
  SUITS,
  cardPoints,
  cardStrength,
  createDeck,
  determineTrickWinner,
  nextSeat,
  sameCard,
  teamOf,
} from '../../game-engine/src'
import type {
  Bid,
  Card,
  Contract,
  GameAction,
  Play,
  PlayerView,
  Seat,
  Suit,
} from '../../game-engine/src'
import { randomStream } from './random'
import type { DecisionReason } from './reasons'
import type { BotContext, BotDecision, DecisionGrade } from './types'

export const cardKey = (card: Card) => card.suit + card.rank
const deck = createDeck()
export const visiblePlays = (view: PlayerView) => [
  ...view.tricks.flatMap((trick) => trick.plays),
  ...view.trick,
]
export const isContract = (bid: Bid): bid is Contract => (CONTRACTS as readonly Bid[]).includes(bid)

export function decisionSeed(view: PlayerView, context: BotContext): number {
  if (context.decisionSeed !== undefined) return context.decisionSeed
  const signature = [
    view.seat,
    view.revision,
    ...view.hand.map(cardKey),
    ...view.bids.map((entry) => entry.bid),
  ].join('|')
  let hash = 2166136261
  for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619)
  return hash >>> 0
}

function handSupport(hand: Card[], contract: Contract): number {
  let strength = 0
  for (const suit of SUITS) {
    const cards = hand.filter((card) => card.suit === suit)
    const has = (rank: Card['rank']) => cards.some((card) => card.rank === rank)
    if (suit === contract || contract === 'all-trumps') {
      strength += Number(has('J')) * 3.25 + Number(has('9')) * (has('J') ? 3.2 : 1.9)
      strength += Number(has('A')) * (cards.length > 1 ? 1.35 : 0.75)
      strength += Number(has('10') && cards.length > 1) * 0.9
      strength += Number(has('K') && has('Q')) * 1.3
      if (suit === contract) strength += cards.length * 0.65 + Math.max(0, cards.length - 2) * 0.95
    } else {
      strength += Number(has('A')) * (contract === 'no-trumps' ? 2.85 : 1.65)
      strength += Number(has('10')) * (has('A') ? 2 : cards.length > 1 ? 1.15 : 0.35)
      strength += Number(has('K') && cards.length > 1) * 0.45
    }
  }
  if (contract === 'all-trumps') return strength - 6.05
  if (contract === 'no-trumps') return strength - 5.35
  return strength - 5.65
}

interface Candidate {
  action: GameAction
  score: number
  reason: DecisionReason
}

function auction(view: PlayerView, actions: GameAction[]): Candidate[] {
  const mine = teamOf(view.seat)
  const partnerOwns = view.declaringTeam === mine && view.bidder !== view.seat
  const partnerBids = view.bids.filter(
    (entry) => entry.seat !== view.seat && teamOf(entry.seat) === mine,
  )
  const support = new Map(CONTRACTS.map((contract) => [contract, handSupport(view.hand, contract)]))
  return actions.map((action) => {
    if (action.type !== 'bid') throw new Error('Expected an auction action')
    const bid = action.bid
    if (bid === 'pass') return { action, score: 0, reason: partnerOwns ? 'partnerBid' : 'weakBid' }
    if (bid === 'contra' || bid === 'recontra') {
      const backing = support.get(view.contract!)!
      const score = backing - (bid === 'contra' ? 2.9 : partnerOwns ? 0.9 : 1.5)
      return { action, score, reason: bid === 'contra' ? 'double' : 'redouble' }
    }
    const partnerNamedSuit = partnerBids.some((entry) => (SUITS as readonly Bid[]).includes(entry.bid))
    const partnerNamedNoTrumps = partnerBids.some((entry) => entry.bid === 'no-trumps')
    const supportBonus = bid === 'all-trumps' && partnerNamedSuit ? 0.6 : 0
    const fit = partnerOwns && view.contract ? Math.max(0, support.get(view.contract)!) * 0.3 : 0
    const opportunityCost = partnerOwns
      ? 2.6 + fit + Number(partnerNamedNoTrumps) * 0.4
      : view.contract
        ? 0.45
        : 0
    const reason = bid === 'all-trumps' ? 'allBid' : bid === 'no-trumps' ? 'noBid' : 'suitBid'
    return { action, score: support.get(bid)! + supportBonus - opportunityCost, reason }
  })
}

function knownVoids(view: PlayerView): Set<string> {
  const result = new Set<string>()
  for (const trick of [...view.tricks.map((t) => t.plays), view.trick]) {
    for (const play of trick.slice(1)) {
      if (play.card.suit !== trick[0].card.suit) result.add(play.seat + trick[0].card.suit)
    }
  }
  return result
}

function remainingFoes(seat: Seat, slots: number): Seat[] {
  const result: Seat[] = []
  let next = seat
  for (let i = 0; i < slots; i++) {
    next = nextSeat(next)
    if (teamOf(next) !== teamOf(seat)) result.push(next)
  }
  return result
}

function play(view: PlayerView, actions: GameAction[]): Candidate[] {
  const contract = view.contract!
  const mine = teamOf(view.seat)
  const seen = new Set([...view.hand, ...visiblePlays(view).map((play) => play.card)].map(cardKey))
  const unknown = deck.filter((card) => !seen.has(cardKey(card)))
  const voids = knownVoids(view)
  const foes = remainingFoes(view.seat, 3 - view.trick.length)
  const currentWinner = view.trick.length ? determineTrickWinner(view.trick, contract) : null
  const partnerLeading = currentWinner !== null && teamOf(currentWinner) === mine
  const pot = view.trick.reduce((sum, p) => sum + cardPoints(p.card, contract), 0)
  const unknownTrump = unknown.some((card) => card.suit === contract)
  const suggestedSuit = [...view.bids]
    .reverse()
    .find(
      (entry) => entry.seat !== view.seat && teamOf(entry.seat) === mine && isContract(entry.bid),
    )?.bid
  const higherCards = (card: Card) =>
    unknown.filter(
      (other) =>
        other.suit === card.suit && cardStrength(other, contract) > cardStrength(card, contract),
    ).length
  const chanceToHold = (card: Card, lead: Suit) => {
    const ableFoes = foes.filter((seat) => !voids.has(seat + card.suit)).length
    let chance = Math.pow(1 - ableFoes / 3, higherCards(card))
    if (
      unknownTrump &&
      card.suit !== contract &&
      foes.some((seat) => !voids.has(seat + contract) && voids.has(seat + lead))
    )
      chance *= 0.33
    return chance
  }
  return actions.map((action) => {
    if (action.type !== 'play') throw new Error('Expected a card')
    const card = action.card
    const points = cardPoints(card, contract)
    const top = higherCards(card) === 0
    const strength = cardStrength(card, contract)
    const qualifiedPair =
      (card.rank === 'K' || card.rank === 'Q') &&
      (contract === 'all-trumps' || contract === card.suit) &&
      view.hand.some(
        (other) => other.suit === card.suit && other.rank === (card.rank === 'K' ? 'Q' : 'K'),
      )
    const pairValue =
      qualifiedPair &&
      (view.trick.length === 0 || card.suit === view.trick[0].card.suit || card.suit === contract)
        ? 4
        : qualifiedPair
          ? -15
          : 0
    if (view.trick.length === 0) {
      const chance = chanceToHold(card, card.suit)
      let score = chance * (points + 9) - (1 - chance) * points + pairValue
      if (
        view.declaringTeam === mine &&
        card.suit === contract &&
        view.hand.filter((c) => c.suit === contract).length >= 3
      )
        score += 3
      if (card.suit === suggestedSuit) score += 1
      return { action, score, reason: top ? 'leadMaster' : 'lead' }
    }
    const plays: Play[] = [...view.trick, { seat: view.seat, card }]
    const winner = determineTrickWinner(plays, contract)
    const winningCard = plays.find((p) => p.seat === winner)!.card
    const teamLeads = teamOf(winner) === mine
    const chance = teamLeads ? chanceToHold(winningCard, plays[0].card.suit) : 0
    const reserveValue = (top ? 6 : 0) + strength * 0.48 + Number(card.suit === contract) * 2
    let score = chance * (pot + points * 2 + 5) - points - reserveValue + pairValue
    if (partnerLeading && winner === view.seat) score -= 3.2
    if (
      !teamLeads &&
      view.hand.filter((other) => other.suit === card.suit).length === 1 &&
      card.suit !== contract
    )
      score += 0.9
    const reason =
      partnerLeading && winner !== view.seat ? 'support' : winner === view.seat ? 'take' : 'discard'
    return { action, score, reason }
  })
}

function ranked(view: PlayerView, actions: GameAction[]): Candidate[] {
  if (!actions.length) throw new Error('A decision requires at least one legal action')
  if (actions.length === 1) return [{ action: actions[0], score: 0, reason: 'forced' }]
  const candidates = actions[0].type === 'bid' ? auction(view, actions) : play(view, actions)
  return candidates.sort((left, right) => right.score - left.score)
}

export function chooseHeuristic(
  view: PlayerView,
  actions: GameAction[],
  context: BotContext = { difficulty: 'intermediate' },
): BotDecision {
  const options = ranked(view, actions)
  let index = 0
  if (context.difficulty === 'beginner' && actions.length > 1) {
    const random = randomStream(decisionSeed(view, context))
    if (random() < 0.25) {
      const close = options.filter(
        (option) => option.score >= options[0].score - (option.action.type === 'bid' ? 2 : 12),
      )
      index = Math.floor(random() * close.length)
    }
  }
  const best = options[index]
  return {
    action: best.action,
    mandatory: actions.length === 1,
    reason: index === 0 ? best.reason : 'beginner',
    alternative: options.find(
      (option) => option !== best && option.score >= best.score - (best.action.type === 'bid' ? 1.2 : 6),
    )?.action,
  }
}

export function sameDecision(left: GameAction, right: GameAction): boolean {
  if (left.type === 'play' && right.type === 'play')
    return left.seat === right.seat && sameCard(left.card, right.card)
  if (left.type === 'bid' && right.type === 'bid')
    return left.seat === right.seat && left.bid === right.bid
  return left.type === 'advance' && right.type === 'advance'
}

export function evaluateDecision(
  view: PlayerView,
  actions: GameAction[],
  action: GameAction,
): { grade: DecisionGrade; recommended: BotDecision } {
  const options = ranked(view, actions)
  const choice = options.find((option) => sameDecision(option.action, action))
  if (!choice) throw new Error('Cannot grade an action outside the legal choices')
  const gap = (options[0].score - choice.score) * (action.type === 'bid' ? 3 : 1)
  const grade =
    gap < 0.001
      ? 'recommended'
      : gap < 2.5
        ? 'good'
        : gap < 6
          ? 'reasonable'
          : gap < 12
            ? 'questionable'
            : 'potential-mistake'
  return { grade, recommended: chooseHeuristic(view, actions) }
}
