export const RULESET = 'bulgarian-classic-v1' as const
export const SEATS = ['south', 'east', 'north', 'west'] as const
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export const CONTRACTS = [...SUITS, 'no-trumps', 'all-trumps'] as const
export type Seat = (typeof SEATS)[number]
export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export type Contract = (typeof CONTRACTS)[number]
export type Team = 'us' | 'them'
export type TeamPoints = Record<Team, number>
export type Multiplier = 1 | 2 | 4
export type Bid = Contract | 'pass' | 'contra' | 'recontra'
export interface Card {
  suit: Suit
  rank: Rank
}
export interface Play {
  seat: Seat
  card: Card
}
export interface Trick {
  plays: Play[]
  winner: Seat
}
export interface BidEntry {
  seat: Seat
  bid: Bid
}
export interface Declaration {
  id: string
  kind: 'sequence' | 'carre'
  cards: Card[]
  points: number
  high: Rank
  /** A shorter run becomes maximal only after these four cards are used in their carré. */
  requiresCarre?: string
}
export interface Announcement {
  seat: Seat
  declaration: Declaration
}
export interface Belot {
  seat: Seat
  suit: Suit
}
export type Phase =
  | 'MATCH_SETUP'
  | 'INITIAL_DEAL'
  | 'BIDDING'
  | 'FINAL_DEAL'
  | 'PLAYING_TRICK'
  | 'TRICK_RESOLUTION'
  | 'HAND_SCORING'
  | 'NEXT_HAND'
  | 'MATCH_COMPLETE'
export interface MatchConfig {
  target?: number
  dealer?: Seat
  practiceContract?: Contract
}
export interface ScoreBreakdown {
  cardPoints: TeamPoints
  lastTrick: TeamPoints
  declarations: TeamPoints
  belots: TeamPoints
  noTrumpBonus: TeamPoints
  capot: Team | null
  capotBonus: TeamPoints
  raw: TeamPoints
  multiplier: Multiplier
  outcome: 'made' | 'failed' | 'tied'
  /** Includes any previous hanging points claimed on this hand. */
  awarded: TeamPoints
  hangingBefore: number
  hangingAfter: number
  hangingAwarded: TeamPoints
}
export type GameAction =
  | { type: 'bid'; seat: Seat; bid: Bid; revision: number }
  | { type: 'play'; seat: Seat; card: Card; declarations?: string[]; revision: number }
  | { type: 'advance'; revision: number }
export interface PublicState {
  ruleset: typeof RULESET
  revision: number
  target: number
  handNumber: number
  phase: Phase
  dealer: Seat
  turn: Seat
  contract: Contract | null
  bidder: Seat | null
  declaringTeam: Team | null
  multiplier: Multiplier
  bids: BidEntry[]
  passes: number
  trick: Play[]
  tricks: Trick[]
  declarations: Announcement[]
  declarationPoints: TeamPoints
  belots: Belot[]
  scores: TeamPoints
  hanging: number
  result: ScoreBreakdown | null
  winner: Team | null
}
/** Only this projection may be sent to a bot or to a live coaching routine. */
export interface PlayerView extends PublicState {
  seat: Seat
  hand: Card[]
  counts: Record<Seat, number>
}
export interface GameState extends PublicState {
  version: 1
  seed: number
  config: MatchConfig
  hands: Record<Seat, Card[]>
  stock: Card[]
  originalHands: Record<Seat, Card[]>
}
export interface GameEvent {
  version: 1
  revision: number
  action: GameAction
  phase: Phase
}
export interface Replay {
  version: 1
  ruleset: typeof RULESET
  config: MatchConfig
  seed: number
  events: GameEvent[]
}
