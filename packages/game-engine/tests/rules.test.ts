import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyCommand,
  allocateScore,
  calculateHandScore,
  calculateMatchResult,
  cardPoints,
  cardStrength,
  CONTRACTS,
  createDeck,
  createMatch,
  declarationsCompatible,
  detectDeclarations,
  determineTrickWinner,
  getLegalActions,
  getLegalCards,
  getPlayerView,
  legalBids,
  legalCardsFor,
  nextSeat,
  RANKS,
  recommendedDeclarations,
  replayGame,
  resolveDeclarations,
  SEATS,
  shuffledDeck,
  SUITS,
  teamOf,
  validateAction,
} from '../src'
import type { Bid, Card, GameEvent, GameState, Play, Rank, Seat, Suit } from '../src'

const c = (rank: Rank, suit: Suit = 'hearts'): Card => ({ rank, suit })
const p = (seat: Seat, rank: Rank, suit: Suit = 'hearts'): Play => ({ seat, card: c(rank, suit) })
const run = (suit: Suit, ...ranks: Rank[]): Card[] => ranks.map((rank) => c(rank, suit))
const four = (rank: Rank) => SUITS.map((suit) => c(rank, suit))
const step = (s: GameState) => applyAction(s, { type: 'advance', revision: s.revision })
const bid = (s: GameState, value: Bid) =>
  applyAction(s, { type: 'bid', seat: s.turn, revision: s.revision, bid: value })
const play = (s: GameState, card: Card, declarations?: string[]) =>
  applyAction(s, { type: 'play', seat: s.turn, revision: s.revision, card, declarations })
const bidAll = (s: GameState, ...bids: Bid[]) => bids.reduce(bid, s)

describe('the deck, packets and auction', () => {
  it('contains exactly 32 distinct cards', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(32)
    expect(new Set(deck.map((card) => card.rank + card.suit)).size).toBe(32)
  })
  it('shuffles reproducibly and distributes cards across all opening positions', () => {
    expect(shuffledDeck(123)).toEqual(shuffledDeck(123))
    expect(shuffledDeck(123, 2)).not.toEqual(shuffledDeck(123))
    const counts = new Map<string, number>()
    for (let seed = 0; seed < 3200; seed++) {
      const { rank, suit } = shuffledDeck(seed)[0]!
      counts.set(rank + suit, (counts.get(rank + suit) ?? 0) + 1)
    }
    expect(counts.size).toBe(32)
    expect(Math.min(...counts.values())).toBeGreaterThan(55)
    expect(Math.max(...counts.values())).toBeLessThan(150)
  })
  it.each(SEATS)('deals three, two and three starting to the right of %s', (dealer) => {
    const s = createMatch({ dealer }, 73)
    const deck = shuffledDeck(73)
    let seat = nextSeat(dealer)
    expect(s.turn).toBe(seat)
    expect(s.stock).toEqual(deck.slice(20))
    const final = step(bidAll(s, 'spades', 'pass', 'pass', 'pass'))
    expect(final.phase).toBe('PLAYING_TRICK')
    expect(final.turn).toBe(seat)
    for (let i = 0; i < 4; i++) {
      const five = [...deck.slice(i * 3, i * 3 + 3), ...deck.slice(12 + i * 2, 14 + i * 2)]
      expect(s.hands[seat]).toEqual(five)
      expect(final.hands[seat]).toEqual([...five, ...deck.slice(20 + i * 3, 23 + i * 3)])
      expect(final.originalHands[seat]).toEqual(final.hands[seat])
      seat = nextSeat(seat)
    }
    expect(final.stock).toEqual([])
  })
  it('alternates partnerships counterclockwise', () => {
    expect(SEATS.map(nextSeat)).toEqual(['east', 'north', 'west', 'south'])
    expect(SEATS.map(teamOf)).toEqual(['us', 'them', 'us', 'them'])
  })
  it('rotates the dealer after four opening passes and preserves hanging and match points', () => {
    const initial = { ...createMatch(), hanging: 16, scores: { us: 152, them: 131 } }
    const passed = bidAll(initial, 'pass', 'pass', 'pass', 'pass')
    expect(passed).toMatchObject({ phase: 'NEXT_HAND', result: null, winner: null })
    expect(passed.bids).toHaveLength(4)
    const next = step(step(passed))
    expect(next).toMatchObject({
      handNumber: 2,
      dealer: 'south',
      turn: 'east',
      phase: 'BIDDING',
      scores: initial.scores,
      hanging: 16,
      bids: [],
    })
    expect(next.hands).not.toEqual(initial.hands)
  })
  it('supports re-entry after passing and higher calls only', () => {
    let s = bidAll(createMatch(), 'pass', 'clubs', 'pass', 'pass')
    expect(s.turn).toBe('south')
    expect(legalBids(s, 'south')).toEqual([
      'pass',
      'diamonds',
      'hearts',
      'spades',
      'no-trumps',
      'all-trumps',
      'contra',
    ])
    expect(legalBids(s, 'north')).toEqual([])
    s = bid(s, 'no-trumps')
    expect(s).toMatchObject({ passes: 0, bidder: 'south', declaringTeam: 'us' })
    expect(legalBids(s, 'east')).toEqual(['pass', 'all-trumps', 'contra'])
  })
  it('restricts doubles to opponents and redoubles to declarers, resets passes on each', () => {
    let s = bidAll(createMatch(), 'hearts', 'pass')
    expect(legalBids(s, 'north')).not.toContain('contra')
    s = bidAll(s, 'pass', 'contra')
    expect(s).toMatchObject({ multiplier: 2, passes: 0, bidder: 'south' })
    s = bid(s, 'pass')
    expect(legalBids(s, 'east')).not.toContain('recontra')
    s = bidAll(s, 'pass', 'recontra')
    expect(s).toMatchObject({ phase: 'BIDDING', passes: 0, multiplier: 4 })
    expect(bidAll(s, 'pass', 'pass', 'pass').phase).toBe('FINAL_DEAL')
    s = bid(s, 'all-trumps')
    expect(s).toMatchObject({ multiplier: 1, passes: 0, bidder: 'west', declaringTeam: 'them' })
    expect(legalBids(s, 'south')).toEqual(['pass', 'contra'])
  })
})

describe('rank and trick obligations', () => {
  it('uses independent trump and non-trump point tables and rankings', () => {
    expect(RANKS.map((rank) => cardPoints(c(rank), 'hearts'))).toEqual([0, 0, 14, 10, 20, 3, 4, 11])
    expect(RANKS.map((rank) => cardPoints(c(rank), 'spades'))).toEqual([0, 0, 0, 10, 2, 3, 4, 11])
    for (const suit of SUITS) {
      expect(
        [...RANKS].sort(
          (a, b) => cardStrength(c(b, suit), 'all-trumps') - cardStrength(c(a, suit), 'all-trumps'),
        ),
      ).toEqual(['J', '9', 'A', '10', 'K', 'Q', '8', '7'])
      expect(
        [...RANKS].sort(
          (a, b) => cardStrength(c(b, suit), 'no-trumps') - cardStrength(c(a, suit), 'no-trumps'),
        ),
      ).toEqual(['A', '10', 'K', 'Q', 'J', '9', '8', '7'])
    }
  })
  it.each(CONTRACTS)('follows the led suit before considering any other suit under %s', (contract) => {
    const only = c('7', 'clubs')
    expect(legalCardsFor([only, c('J')], [p('east', 'Q', 'clubs')], contract, 'north')).toEqual([only])
  })
  it('requires climbing on a trump lead and in All Trumps even when partner holds the trick', () => {
    const hand = run('hearts', '7', 'J', '9')
    const trick = [p('south', '10'), p('east', '8')]
    for (const contract of ['hearts', 'all-trumps'] as const)
      expect(legalCardsFor(hand, trick, contract, 'north')).toEqual(run('hearts', 'J', '9'))
    expect(legalCardsFor(hand, trick, 'no-trumps', 'north')).toEqual(hand)
    expect(legalCardsFor(hand, trick, 'clubs', 'north')).toEqual(hand)
    expect(legalCardsFor(run('hearts', '7', '8'), trick, 'all-trumps', 'north')).toEqual(
      run('hearts', '7', '8'),
    )
  })
  it('requires trumping an opponent, overtrumping when possible, and permits any discard when beaten', () => {
    const hand = [c('8'), c('J'), c('A', 'spades')]
    const lead = p('east', 'A', 'clubs')
    expect(legalCardsFor(hand, [lead], 'hearts', 'north')).toEqual(hand.slice(0, 2))
    expect(legalCardsFor(hand, [lead, p('north', '9')], 'hearts', 'west')).toEqual([hand[1]])
    expect(legalCardsFor([hand[0]!, hand[2]!], [lead, p('north', '9')], 'hearts', 'west')).toEqual([
      hand[0],
      hand[2],
    ])
    expect(legalCardsFor(hand, [lead, p('north', '7', 'clubs')], 'hearts', 'west')).toEqual(hand)
    expect(legalCardsFor(hand, [lead], 'no-trumps', 'north')).toEqual(hand)
    expect(legalCardsFor(hand, [lead], 'all-trumps', 'north')).toEqual(hand)
  })
  it('scores off-suit wins only for a single dominant trump', () => {
    const trick = [
      p('north', '10', 'clubs'),
      p('west', '7'),
      p('south', 'J', 'spades'),
      p('east', '9', 'clubs'),
    ]
    expect(determineTrickWinner(trick, 'hearts')).toBe('west')
    expect(determineTrickWinner(trick, 'all-trumps')).toBe('east')
    expect(determineTrickWinner(trick, 'no-trumps')).toBe('north')
  })
})

describe('declarations and Belot', () => {
  it.each([3, 4, 5, 6, 7, 8])('detects the maximal natural sequence of length %s', (length) => {
    const cards = run('spades', ...RANKS.slice(0, length))
    expect(detectDeclarations(cards, 'all-trumps')).toMatchObject([
      { cards, kind: 'sequence', points: length === 3 ? 20 : length === 4 ? 50 : 100 },
    ])
    expect(detectDeclarations(cards, 'no-trumps')).toEqual([])
  })
  it.each(RANKS)('scores eligible fours of %s', (rank) => {
    const actual = detectDeclarations(four(rank), 'hearts')
    if (rank === '7' || rank === '8') expect(actual).toEqual([])
    else
      expect(actual).toMatchObject([
        { kind: 'carre', points: rank === 'J' ? 200 : rank === '9' ? 150 : 100 },
      ])
  })
  it('offers declarations separately when choices use the same card and rejects an overlapping submission', () => {
    const hand = [...four('J'), ...run('hearts', '9', '10'), ...run('clubs', '7', '8')]
    const all = detectDeclarations(hand, 'hearts')
    expect(all).toHaveLength(2)
    expect(declarationsCompatible(all)).toBe(false)
    expect(recommendedDeclarations(hand, 'hearts')).toMatchObject([{ kind: 'carre' }])
    const s = createMatch({ practiceContract: 'hearts' })
    s.hands.south = hand
    expect(() =>
      play(
        s,
        hand[0]!,
        all.map((d) => d.id),
      ),
    ).toThrow()
    expect(() => play(s, hand[0]!, ['unknown'])).toThrow()
    expect(() => play(s, hand[0]!, [all[0]!.id, all[0]!.id])).toThrow()
    expect(play(s, hand[0]!, []).declarations).toEqual([])
    expect(play(s, hand[0]!, [all[0]!.id]).declarations).toMatchObject([
      { seat: 'south', declaration: all[0] },
    ])
  })
  it('compares sequence length, then high rank, cancels ties and settles carrés independently', () => {
    const ann = (seat: Seat, cards: Card[]) =>
      detectDeclarations(cards, 'spades').map((declaration) => ({ seat, declaration }))
    const us = [...ann('south', run('clubs', 'J', 'Q', 'K')), ...ann('north', four('J'))]
    expect(
      resolveDeclarations([
        ...us,
        ...ann('west', run('hearts', 'J', 'Q', 'K')),
        ...ann('east', four('9')),
      ]),
    ).toEqual({ us: 200, them: 0 })
    expect(
      resolveDeclarations([
        ...us,
        ...ann('west', run('hearts', '7', '8', '9', '10')),
        ...ann('east', run('spades', 'Q', 'K', 'A')),
      ]),
    ).toEqual({ us: 200, them: 70 })
    expect(resolveDeclarations([...us, ...ann('west', run('hearts', 'Q', 'K', 'A'))])).toEqual({
      us: 200,
      them: 20,
    })
  })
  it('keeps the unused heart quarte when four jacks absorb the fifth card of a sequence', () => {
    const hand = [...four('J'), ...run('hearts', '7', '8', '9', '10')]
    const s = createMatch({ practiceContract: 'hearts' })
    s.hands.south = hand
    const options = detectDeclarations(hand, 'hearts')
    const long = options.find((d) => d.cards.length === 5)!
    const carre = options.find((d) => d.kind === 'carre')!
    const leftover = options.find((d) => d.requiresCarre)!
    expect(leftover).toMatchObject({ points: 50, high: '10', requiresCarre: carre.id })
    expect(recommendedDeclarations(hand, 'hearts')).toEqual([carre, leftover])
    const automatic = play(s, hand[0]!)
    const manual = play(s, hand[0]!, [leftover.id, carre.id])
    expect(manual.declarations).toEqual(automatic.declarations)
    expect(resolveDeclarations(manual.declarations)).toEqual({ us: 250, them: 0 })
    expect(() => play(s, hand[0]!, [leftover.id])).toThrow()
    expect(() => play(s, hand[0]!, [long.id, leftover.id, carre.id])).toThrow()
    expect(play(s, hand[0]!, [long.id]).declarations).toHaveLength(1)
  })
  it('settles announced declarations when the first completed trick is collected', () => {
    let s = createMatch({ practiceContract: 'hearts' })
    s.hands = {
      south: run('hearts', 'J', 'Q', 'K'),
      east: run('hearts', '7'),
      north: run('hearts', '8'),
      west: run('hearts', '9'),
    }
    for (const rank of ['J', '7', '8', '9'] as const) s = play(s, c(rank))
    expect(s.phase).toBe('TRICK_RESOLUTION')
    expect(s.declarationPoints.us).toBe(0)
    s = step(s)
    expect(s.declarationPoints.us).toBe(20)
    expect(() => play(s, c('Q'), ['seq-hearts-J-K'])).toThrow()
    const malformed = JSON.parse(
      '{"type":"play","declarations":{},"seat":"south","card":{"rank":"Q","suit":"hearts"}}',
    )
    expect(validateAction(s, { ...malformed, revision: s.revision })).toBe(false)
  })
  it('announces a trump marriage on its first lead, follow, trump or undertrump', () => {
    for (const trick of [
      [],
      [p('west', 'A')],
      [p('west', 'A', 'spades')],
      [p('north', 'A', 'spades'), p('west', 'J')],
    ]) {
      const s = createMatch({ practiceContract: 'hearts' })
      s.hands.south = run('hearts', 'Q', 'K')
      s.trick = trick
      const next = play(s, c('K'))
      expect(next.belots).toEqual([{ seat: 'south', suit: 'hearts' }])
      expect(play({ ...next, turn: 'south', trick: [] }, c('Q')).belots).toHaveLength(1)
    }
  })
  it('allows several All Trumps pairs, forfeits an off-suit pair, and prohibits No Trumps Belot', () => {
    const state = createMatch({ practiceContract: 'all-trumps' })
    state.hands.south = [...run('hearts', 'K', 'Q'), ...run('clubs', 'K', 'Q')]
    const first = play(state, c('K'))
    const next = play({ ...first, turn: 'south', trick: [] }, c('K', 'clubs'))
    expect(next.belots).toHaveLength(2)
    const thrown = play({ ...state, trick: [p('west', 'A', 'diamonds')] }, c('Q'))
    expect(thrown.belots).toEqual([])
    expect(play({ ...thrown, turn: 'south', trick: [] }, c('K')).belots).toEqual([])
    expect(play({ ...state, contract: 'no-trumps' }, c('K')).belots).toEqual([])
  })
})

describe('score allocation', () => {
  it.each([
    ['spades', 96, 66, 9, 7, 0],
    ['all-trumps', 134, 124, 13, 13, 0],
    ['spades', 106, 106, 0, 10, 11],
    ['all-trumps', 154, 154, 0, 15, 16],
    ['no-trumps', 136, 124, 14, 12, 0],
    ['hearts', 25, 137, 0, 16, 0],
  ] as const)('converts %s %s/%s', (contract, us, them, a, b, carry) => {
    expect(allocateScore({ us, them }, contract, 'us', 1)).toMatchObject({
      awarded: { us: a, them: b },
      hangingAfter: carry,
    })
  })
  it('settles repeated hangs on the next decisive hand, independent of the multiplier', () => {
    const first = allocateScore({ us: 154, them: 154 }, 'all-trumps', 'us', 1)
    const second = allocateScore({ us: 106, them: 106 }, 'clubs', 'us', 2, first.hangingAfter)
    const third = allocateScore({ us: 106, them: 106 }, 'clubs', 'them', 4, second.hangingAfter)
    expect(second.awarded).toEqual({ us: 0, them: 0 })
    expect(second.hangingAfter).toBe(16 + 42)
    expect(third.hangingAfter).toBe(16 + 42 + 85)
    expect(allocateScore({ us: 20, them: 142 }, 'hearts', 'us', 4, third.hangingAfter)).toMatchObject({
      outcome: 'failed',
      hangingAfter: 0,
      awarded: { us: 0, them: 65 + 143 },
      hangingAwarded: { us: 0, them: 143 },
    })
    expect(allocateScore({ us: 90, them: 72 }, 'hearts', 'us', 2, 7).awarded).toEqual({
      us: 39,
      them: 0,
    })
  })
  it.each(CONTRACTS)('accounts for every card and the last trick in a %s capot', (contract) => {
    const deck = createDeck()
    const tricks = Array.from({ length: 8 }, (_, i) => ({
      plays: deck.slice(i * 4, i * 4 + 4).map((card, j) => ({ seat: SEATS[j]!, card })),
      winner: 'north' as const,
    }))
    const state = {
      contract,
      declaringTeam: 'us' as const,
      multiplier: 1 as const,
      tricks,
      hanging: 0,
      belots: [],
      declarationPoints: { us: 0, them: 0 },
    }
    const single = calculateHandScore(state)
    expect(single.lastTrick).toEqual({ us: 10, them: 0 })
    expect(single.capotBonus).toEqual({ us: 90, them: 0 })
    const base = contract === 'no-trumps' ? 260 : contract === 'all-trumps' ? 258 : 162
    expect(single.raw).toEqual({ us: base + 90, them: 0 })
    if (contract === 'no-trumps') {
      expect(single.awarded.us).toBe(35)
      expect(calculateHandScore({ ...state, multiplier: 2 }).awarded.us).toBe(70)
    }
  })
  it.each([
    [{ us: 150, them: 149 }, null, null],
    [{ us: 151, them: 151 }, null, null],
    [{ us: 151, them: 153 }, null, 'them'],
    [{ us: 165, them: 153 }, null, 'us'],
    [{ us: 170, them: 110 }, 'us', null],
    [{ us: 170, them: 110 }, 'them', null],
  ] as const)('decides completion from the eligible hand and total scores', (scores, capot, winner) => {
    expect(calculateMatchResult(scores, 151, capot)).toBe(winner)
  })
})

describe('commands, projections and replay', () => {
  it('rejects stale duplicates, off-turn actors, incorrect phases and a forbidden play', () => {
    const s = createMatch()
    const command = getLegalActions(s, 'south')[0]!
    expect(validateAction(s, command)).toBe(true)
    expect(() => step(s)).toThrow()
    expect(getLegalActions(s, 'east')).toEqual([])
    expect(() => play(s, s.hands.south[0]!)).toThrow()
    const next = applyAction(s, command)
    expect(() => applyAction(next, command)).toThrow()
    expect(() =>
      applyAction(s, { type: 'bid', seat: 'east', bid: 'hearts', revision: s.revision }),
    ).toThrow()
    const table = createMatch({ practiceContract: 'spades' })
    table.hands.south = [c('7'), c('J', 'spades')]
    table.trick = [p('west', '9')]
    expect(getLegalCards(table, 'south')).toEqual([c('7')])
    expect(() => play(table, c('J', 'spades'))).toThrow()
  })
  it('filters unrevealed information and isolates public view mutations', () => {
    const s = createMatch()
    const view = getPlayerView(s, 'east')
    for (const forbidden of ['hands', 'stock', 'seed', 'config', 'originalHands'])
      expect(view).not.toHaveProperty(forbidden)
    expect(view.hand).toEqual(s.hands.east)
    expect(view.counts).toEqual({ north: 5, east: 5, west: 5, south: 5 })
    const originalRank = s.hands.east[0]!.rank
    view.hand[0]!.rank = originalRank === 'Q' ? '7' : 'Q'
    view.scores.us = 999
    expect(s.hands.east[0]!.rank).toBe(originalRank)
    expect(s.scores.us).toBe(0)
    expect(
      getPlayerView(
        {
          ...s,
          seed: 888,
          stock: [...s.stock].reverse(),
          hands: { ...s.hands, east: s.hands.east, west: s.hands.north, north: s.hands.west },
        },
        'east',
      ),
    ).toEqual(getPlayerView(s, 'east'))
  })
  it('replays full hands, survives JSON restore at each revision, and scores once', () => {
    for (const contract of CONTRACTS) {
      const initial = createMatch({ target: 51 }, 8)
      const saved = JSON.stringify(initial)
      let s = initial
      const events: GameEvent[] = []
      const act = (command: Parameters<typeof applyCommand>[1]) => {
        const result = applyCommand(s, command)
        expect(applyAction(JSON.parse(JSON.stringify(s)) as GameState, command)).toEqual(result.state)
        s = result.state
        events.push(result.event)
      }
      for (const value of [contract, 'pass', 'pass', 'pass'] as const)
        act({ type: 'bid', seat: s.turn, revision: s.revision, bid: value })
      while (s.result === null) {
        const legal = getLegalActions(s, s.turn)
        act(legal[0] ?? { type: 'advance', revision: s.revision })
      }
      expect(JSON.stringify(initial)).toBe(saved)
      expect(s.tricks).toHaveLength(8)
      expect(replayGame(initial, JSON.parse(JSON.stringify(events)) as GameEvent[])).toEqual(s)
      expect(() => applyAction(s, events.at(-1)!.action)).toThrow()
      expect(() => replayGame(initial, [{ ...events[0]!, revision: 0 }])).toThrow()
    }
  })
})
