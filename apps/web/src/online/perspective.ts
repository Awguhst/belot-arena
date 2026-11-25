import {
  SEATS,
  otherTeam,
  teamOf,
  type GameAction,
  type PlayerView,
  type ScoreBreakdown,
  type Seat,
  type Team,
  type TeamPoints,
} from '@belot/game-engine'

// The engine names its teams from geographic South. The visual table always seats its viewer at the bottom.
export function tableSeat(seat: Seat, viewer: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) - SEATS.indexOf(viewer) + 4) % 4]
}

export function roomSeat(seat: Seat, viewer: Seat): Seat {
  return SEATS[(SEATS.indexOf(seat) + SEATS.indexOf(viewer)) % 4]
}

export function tableAction(action: GameAction, viewer: Seat): GameAction {
  return action.type === 'advance' ? action : { ...action, seat: tableSeat(action.seat, viewer) }
}

export function roomAction(action: GameAction, viewer: Seat): GameAction {
  return action.type === 'advance' ? action : { ...action, seat: roomSeat(action.seat, viewer) }
}

export function tableView(view: PlayerView): PlayerView {
  const viewer = view.seat
  if (viewer === 'south') return view
  const seat = (value: Seat) => tableSeat(value, viewer)
  const sameTeam = teamOf(viewer) === 'us'
  const team = (value: Team | null) => (!value || sameTeam ? value : otherTeam(value))
  const points = (value: TeamPoints) => (sameTeam ? value : { us: value.them, them: value.us })
  const entry = <T extends { seat: Seat }>(v: T): T => ({ ...v, seat: seat(v.seat) })
  const r = view.result
  const result: ScoreBreakdown | null = r && {
    ...r,
    cardPoints: points(r.cardPoints),
    lastTrick: points(r.lastTrick),
    declarations: points(r.declarations),
    belots: points(r.belots),
    noTrumpBonus: points(r.noTrumpBonus),
    raw: points(r.raw),
    capot: team(r.capot),
    capotBonus: points(r.capotBonus),
    awarded: points(r.awarded),
    hangingAwarded: points(r.hangingAwarded),
  }
  return {
    ...view,
    seat: 'south',
    dealer: seat(view.dealer),
    turn: seat(view.turn),
    bidder: view.bidder && seat(view.bidder),
    declaringTeam: team(view.declaringTeam),
    winner: team(view.winner),
    scores: points(view.scores),
    result,
    counts: {
      south: view.counts[viewer],
      east: view.counts[roomSeat('east', viewer)],
      north: view.counts[roomSeat('north', viewer)],
      west: view.counts[roomSeat('west', viewer)],
    },
    bids: view.bids.map(entry),
    trick: view.trick.map(entry),
    tricks: view.tricks.map((trick) => ({ plays: trick.plays.map(entry), winner: seat(trick.winner) })),
    belots: view.belots.map(entry),
    declarations: view.declarations.map(entry),
    declarationPoints: points(view.declarationPoints),
  }
}
