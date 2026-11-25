import type {
  Bid,
  Card,
  Contract,
  Multiplier,
  Play,
  Seat,
  Suit,
  Team,
  TeamPoints,
} from '@belot/game-engine'
import { RANKS, RULESET } from '@belot/game-engine'

export type Language = 'bg' | 'en'
export interface Copy {
  en: string
  bg: string
}
export const copy = (en: string, bg: string): Copy => ({ en, bg })
export type Difficulty = 'beginner' | 'intermediate' | 'advanced'
export type Category =
  | 'legal'
  | 'winner'
  | 'trump'
  | 'overtrump'
  | 'bid'
  | 'declaration'
  | 'score'
  | 'partner'
  | 'basics'
  | 'tracking'

const suitCodes = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' } as const
export const glyph: Record<Suit, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }
export const contractName: Record<Contract, Copy> = {
  clubs: copy('Clubs', 'Спатия'),
  diamonds: copy('Diamonds', 'Каро'),
  hearts: copy('Hearts', 'Купа'),
  spades: copy('Spades', 'Пика'),
  'no-trumps': copy('No Trumps', 'Без коз'),
  'all-trumps': copy('All Trumps', 'Всичко коз'),
}
export const seatName: Record<Seat, Copy> = {
  north: copy('North', 'Север'),
  south: copy('South', 'Юг'),
  east: copy('East', 'Изток'),
  west: copy('West', 'Запад'),
}
export function cardFromCode(code: string): Card {
  const rank = RANKS.find((value) => value === code.slice(0, -1))
  const suit = suitCodes[code.slice(-1) as keyof typeof suitCodes]
  if (!rank || !suit) throw new Error('Invalid study card ' + code)
  return { rank, suit }
}
export const hand = (codes: string): Card[] => codes.split(' ').map(cardFromCode)
export const cardKey = (card: Card): string => card.rank + card.suit[0]
export const play = (seat: Seat, card: string): Play => ({ seat, card: cardFromCode(card) })

export type StudyState =
  | { kind: 'deck' | 'partner' }
  | { kind: 'trick'; contract: Contract; trick: Play[] }
  | {
      kind: 'play'
      contract: Contract
      trick: Play[]
      hand: Card[]
      askAboutSet?: boolean
      tactic?: 'donate' | 'cheapest-winner'
    }
  | {
      kind: 'auction'
      bids: Bid[]
      hand: Card[]
      dealer: Seat
      goal: 'lowest-higher' | 'double' | 'supported-suit' | 'redouble'
    }
  | { kind: 'declarations'; contract: Contract; hand: Card[] }
  | {
      kind: 'score'
      contract: Contract
      raw: TeamPoints
      bidder: Team
      multiplier: Multiplier
      hanging?: number
    }
  | { kind: 'count'; contract: Contract; suit: Suit; seen: Card[]; hand: Card[] }

export interface Answer {
  id: string
  label?: Copy
  card?: Card
}
export type Rule = 'required' | 'tactical' | 'knowledge'
export interface Puzzle {
  id: string
  ruleset: typeof RULESET
  difficulty: Difficulty
  category: Category
  perspective: Seat
  rule: Rule
  title: Copy
  prompt: Copy
  explanation: Copy
  initialState: StudyState
  choices: Answer[]
  expectedActions: string[]
  alternativeSolutions?: string[]
}
export interface Lesson {
  id: string
  topic: Copy
  explanation: Copy
  puzzleId: string
}

export const cardChoices = (codes: string): Answer[] =>
  hand(codes).map((card) => ({ id: cardKey(card), card }))
export const choice = (id: string, en: string, bg = en): Answer => ({ id, label: copy(en, bg) })
