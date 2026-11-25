import { RULESET } from '@belot/game-engine'
import type { Contract, Play } from '@belot/game-engine'
import { cardChoices, choice, copy, hand, play } from './model'
import type { Category, Copy, Difficulty, Puzzle, StudyState } from './model'

type Entry = Omit<Puzzle, 'ruleset' | 'perspective'>
function puzzle(entry: Entry): Puzzle {
  return { ...entry, ruleset: RULESET, perspective: 'south' }
}
function cardProblem(
  id: string,
  category: Category,
  difficulty: Difficulty,
  title: Copy,
  prompt: Copy,
  explanation: Copy,
  contract: Contract,
  trick: Play[],
  cards: string,
  expected: string[],
  tactic?: 'donate' | 'cheapest-winner',
  alternatives?: string[],
): Puzzle {
  return puzzle({
    id,
    category,
    difficulty,
    title,
    prompt,
    explanation,
    rule: tactic ? 'tactical' : 'required',
    initialState: { kind: 'play', contract, trick, hand: hand(cards), tactic },
    choices: cardChoices(cards),
    expectedActions: expected,
    alternativeSolutions: alternatives,
  })
}
const deckSize = puzzle({
  id: 'the-deck',
  category: 'basics',
  difficulty: 'beginner',
  rule: 'knowledge',
  title: copy('The Belot deck', 'Колодата за белот'),
  prompt: copy('How many cards are in a full Belot deck?', 'Колко карти има в пълната колода за белот?'),
  explanation: copy(
    'Each of the four suits has eight ranks, from seven to ace. Four times eight gives 32 cards.',
    'Във всяка от четирите бои има осем карти, от седмица до асо. Четири по осем прави 32 карти.',
  ),
  initialState: { kind: 'deck' },
  choices: ['24', '32', '36', '52'].map((v) => choice(v, v)),
  expectedActions: ['32'],
})
const seating = puzzle({
  id: 'opposite-seats',
  category: 'partner',
  difficulty: 'beginner',
  rule: 'knowledge',
  title: copy('Across the table', 'Отсреща на масата'),
  prompt: copy(
    'You sit South. Who collects tricks for your team?',
    'Играеш от Юг. Кой друг печели взятки за твоя отбор?',
  ),
  explanation: copy(
    'North sits opposite you. Both partners contribute to the same team score.',
    'Север седи срещу теб. Точките от взятките и на двама ви се събират за отбора.',
  ),
  initialState: { kind: 'partner' },
  choices: [
    choice('west', 'West', 'Запад'),
    choice('north', 'North', 'Север'),
    choice('east', 'East', 'Изток'),
  ],
  expectedActions: ['north'],
})
function winner(
  id: string,
  title: Copy,
  explanation: Copy,
  contract: Contract,
  trick: Play[],
  winningCard: string,
  difficulty: Difficulty = 'beginner',
): Puzzle {
  const codes = trick.map((p) => p.card.rank + p.card.suit[0]).join(' ')
  return puzzle({
    id,
    category: 'winner',
    difficulty,
    title,
    explanation,
    rule: 'knowledge',
    prompt: copy('Which card wins this trick?', 'Коя карта печели тази взятка?'),
    initialState: { kind: 'trick', contract, trick },
    choices: cardChoices(codes),
    expectedActions: [winningCard],
  })
}
const followPrompt = copy(
  'Which card can you legally play?',
  'Коя карта можеш да изиграеш по правилата?',
)
const trumpPrompt = copy('Which card must you play?', 'Коя карта трябва да изиграеш?')
const ordinaryTrick = winner(
  'ace-over-ten',
  copy('Ace against ten', 'Асо срещу десетка'),
  copy(
    'Spades were led. In No Trumps the ace outranks the ten. The ace of hearts is off-suit.',
    'Поискана е пика. На Без коз асото е по-силно от десетката. Асото купа е от друга боя.',
  ),
  'no-trumps',
  [play('south', '10s'), play('east', 'Qs'), play('north', 'As'), play('west', 'Ah')],
  'As',
)
const trumpJack = winner(
  'jack-of-trumps',
  copy('The trump jack', 'Козовото вале'),
  copy(
    'The trump jack beats the nine and the ace. A trump nine is the second strongest trump.',
    'Козовото вале бие деветката и асото. Козовата деветка е вторият по сила коз.',
  ),
  'hearts',
  [play('east', 'Ah'), play('north', '9h'), play('west', 'Jh'), play('south', '7h')],
  'Jh',
)
const follow = cardProblem(
  'follow-clubs',
  'legal',
  'beginner',
  copy('Follow the lead', 'Отговори на боята'),
  followPrompt,
  copy(
    'West led clubs. You hold a club, so you must follow even though the seven cannot beat the king.',
    'Запад поиска спатия. Имаш спатия и трябва да отговориш, макар седмицата да не бие попа.',
  ),
  'hearts',
  [play('west', 'Kc')],
  'Ah 7c As',
  ['7c'],
)
const cut = cardProblem(
  'cut-a-diamond',
  'trump',
  'beginner',
  copy('A chance to trump', 'Време за цакане'),
  trumpPrompt,
  copy(
    'West leads a diamond and is winning. You have no diamonds and one trump, the eight of spades. You must trump.',
    'Запад поиска каро и печели. Нямаш каро, но имаш един коз, осмицата пика. Трябва да цакаш.',
  ),
  'spades',
  [play('west', 'Ad')],
  'Kc Ah 8s',
  ['8s'],
)
const over = cardProblem(
  'overtrump-west',
  'overtrump',
  'intermediate',
  copy('Overtrump West', 'Надцакай Запад'),
  trumpPrompt,
  copy(
    'West has trumped your partner’s ace. Your jack of hearts beats West’s nine, so overtrumping is compulsory.',
    'Запад е цакал асото на партньора ти. Валето купа бие деветката на Запад и си длъжен да надцакаш.',
  ),
  'hearts',
  [play('north', 'Ac'), play('west', '9h')],
  '8h Ad Jh',
  ['Jh'],
)
const unableOver = puzzle({
  id: 'no-higher-trump',
  category: 'overtrump',
  difficulty: 'advanced',
  rule: 'required',
  title: copy('No higher trump', 'Нямаш по-силен коз'),
  prompt: copy('Which cards are you free to play?', 'Кои от картите ти е позволено да изиграеш?'),
  explanation: copy(
    'West holds this trick with the trump jack. You are void in diamonds and cannot overtrump. You may discard any card, including a lower trump.',
    'Запад печели с козовото вале. Нямаш каро и по-силен коз. Можеш да изчистиш всяка карта, включително по-слаб коз.',
  ),
  initialState: {
    kind: 'play',
    contract: 'hearts',
    trick: [play('north', 'Ad'), play('west', 'Jh')],
    hand: hand('8h As Qc'),
    askAboutSet: true,
  },
  choices: [
    choice('8h', 'Only the trump', 'Само коза'),
    choice('any', 'Any card', 'Всяка карта'),
    choice('As+Qc', 'Only the other suits', 'Само другите бои'),
  ],
  expectedActions: ['any'],
})
const partnerClimb = cardProblem(
  'climb-on-partner',
  'overtrump',
  'intermediate',
  copy('Climb on a trump lead', 'Качване върху коз'),
  trumpPrompt,
  copy(
    'A trump was led. Even with North winning, you must beat the strongest trump in the trick when you can. Only your nine beats the ace.',
    'Поискан е коз. Дори Север да печели, трябва да качиш най-силния коз на масата, ако можеш. Само деветката ти бие асото.',
  ),
  'spades',
  [play('east', 'Ks'), play('north', 'As'), play('west', '7s')],
  '8s 9s Ac',
  ['9s'],
)
const noTrumpVoid = puzzle({
  id: 'no-trump-discard',
  category: 'legal',
  difficulty: 'beginner',
  rule: 'required',
  title: copy('Void in No Trumps', 'Без исканата боя на Без коз'),
  prompt: copy('Which discards do the rules allow?', 'Какво ти позволяват да изчистиш правилата?'),
  explanation: copy(
    'You hold no hearts. In No Trumps you may discard any card when void in the led suit.',
    'Нямаш купа. На Без коз, ако не можеш да отговориш в боята, можеш да изчистиш всяка карта.',
  ),
  initialState: {
    kind: 'play',
    contract: 'no-trumps',
    trick: [play('west', 'Kh')],
    hand: hand('Ac 7s Qd'),
    askAboutSet: true,
  },
  choices: [
    choice('7s', 'Only the lowest card', 'Само най-слабата карта'),
    choice('Ac', 'Only the ace', 'Само асото'),
    choice('any', 'Any card', 'Всяка карта'),
  ],
  expectedActions: ['any'],
})
const allClimb = cardProblem(
  'all-trump-climb',
  'legal',
  'intermediate',
  copy('Climbing in All Trumps', 'Качване на Всичко коз'),
  trumpPrompt,
  copy(
    'At All Trumps, you must beat the current highest card of the led suit if possible. The nine of diamonds outranks the ace.',
    'На Всичко коз трябва да качиш най-силната карта от поисканата боя, ако можеш. Деветката каро бие асото.',
  ),
  'all-trumps',
  [play('west', 'Ad')],
  '7d 9d Jc',
  ['9d'],
)
const offSuitJack = winner(
  'off-suit-jack',
  copy('An off-suit jack', 'Вале от друга боя'),
  copy(
    'Only a card of the led suit can win in All Trumps. The nine of clubs beats the ace of clubs. The discarded jack scores points for the winner.',
    'На Всичко коз взятката се печели само от поисканата боя. Деветката спатия бие асото спатия. Изчистеното вале носи точки на победителя.',
  ),
  'all-trumps',
  [play('south', 'Ac'), play('east', '9c'), play('north', '7c'), play('west', 'Jh')],
  '9c',
  'intermediate',
)
function auction(
  id: string,
  title: Copy,
  prompt: Copy,
  explanation: Copy,
  initialState: Extract<StudyState, { kind: 'auction' }>,
  choices: Puzzle['choices'],
  expected: string,
  rule: Puzzle['rule'] = 'required',
): Puzzle {
  return puzzle({
    id,
    title,
    prompt,
    explanation,
    initialState,
    choices,
    rule,
    difficulty: 'intermediate',
    category: 'bid',
    expectedActions: [expected],
  })
}
const higherBid = auction(
  'outbid-hearts',
  copy('Raise the contract', 'По-висока обява'),
  copy(
    'West bids Hearts. What is the lowest contract you can bid?',
    'Запад обявява Купа. Коя е най-ниската обява, с която можеш да го наддадеш?',
  ),
  copy(
    'Contracts rise from Clubs, Diamonds, Hearts and Spades to No Trumps and All Trumps. Spades is the next step above Hearts.',
    'Обявите са подредени Спатия, Каро, Купа, Пика, Без коз и Всичко коз. След Купа идва Пика.',
  ),
  {
    kind: 'auction',
    dealer: 'north',
    bids: ['hearts'],
    hand: hand('Js 9s 7s Ah 8c'),
    goal: 'lowest-higher',
  },
  [
    choice('diamonds', 'Diamonds', 'Каро'),
    choice('spades', 'Spades', 'Пика'),
    choice('no-trumps', 'No Trumps', 'Без коз'),
  ],
  'spades',
)
const doubled = auction(
  'double-the-bid',
  copy('Double the opponents', 'Контрирай противника'),
  copy(
    'West bids Hearts. Which call keeps the contract and doubles the stakes?',
    'Запад обявява Купа. С какво запазваш договора и удвояваш точките?',
  ),
  copy(
    'A defender may call Contra. The contract remains Hearts and the winning team collects the whole doubled score.',
    'Защитник може да обяви Контра. Договорът остава Купа и победителят прибира целия удвоен резултат.',
  ),
  { kind: 'auction', dealer: 'north', bids: ['hearts'], hand: hand('Jh 9h Ah 8s Ac'), goal: 'double' },
  [
    choice('pass', 'Pass', 'Пас'),
    choice('recontra', 'Recontra', 'Реконтра'),
    choice('contra', 'Contra', 'Контра'),
  ],
  'contra',
)
const redoubled = auction(
  'redouble-north',
  copy('Back your partner', 'Подкрепи партньора'),
  copy(
    'North bids Spades and West doubles. Which call sets the multiplier to four?',
    'Север обявява Пика, а Запад дава Контра. Коя обява прави множителя четири?',
  ),
  copy(
    'You are on the declaring team. After the opposition doubles, your team can redouble the active contract.',
    'Ти си от отбора, обявил Пика. След противникова контра твоят отбор може да обяви реконтра.',
  ),
  {
    kind: 'auction',
    dealer: 'east',
    bids: ['spades', 'contra'],
    hand: hand('Js 9s As 8d Ac'),
    goal: 'redouble',
  },
  [
    choice('recontra', 'Recontra', 'Реконтра'),
    choice('contra', 'Contra', 'Контра'),
    choice('pass', 'Pass', 'Пас'),
  ],
  'recontra',
)
const strength = auction(
  'bid-your-long-suit',
  copy('A strong five-card start', 'Силна начална ръка'),
  copy(
    'Which suit bid is best supported by your five cards?',
    'Коя обява в боя е най-добре подкрепена от петте ти карти?',
  ),
  copy(
    'You hold three hearts, including both top trumps. As a practical suit bid, Hearts gives those cards immediate control. The last three cards are still unknown.',
    'Имаш три купи, включително двата най-силни коза. Обявата Купа ти дава контрол в боята. Последните три карти още са неизвестни.',
  ),
  { kind: 'auction', dealer: 'west', bids: [], hand: hand('Jh 9h 7h Ac 8s'), goal: 'supported-suit' },
  [
    choice('spades', 'Spades', 'Пика'),
    choice('hearts', 'Hearts', 'Купа'),
    choice('clubs', 'Clubs', 'Спатия'),
  ],
  'hearts',
  'tactical',
)
function declaration(
  id: string,
  title: Copy,
  explanation: Copy,
  contract: Contract,
  cards: string,
  expected: string,
): Puzzle {
  return puzzle({
    id,
    title,
    explanation,
    rule: 'knowledge',
    category: 'declaration',
    difficulty: 'intermediate',
    prompt: copy(
      'How many points is your best sequence or carré worth before comparison with the opponents?',
      'Колко точки струва най-силният ти анонс от поредица или каре, преди сравняването с противника?',
    ),
    initialState: { kind: 'declarations', contract, hand: hand(cards) },
    choices: ['0', '20', '50', '100', '150', '200'].map((v) => choice(v, v)),
    expectedActions: [expected],
  })
}
const run = declaration(
  'four-card-run',
  copy('Four in a row', 'Четири поредни'),
  copy(
    'Ten, jack, queen and king of spades form a four-card sequence worth 50. Its three-card subsets do not score separately.',
    'Десетка, вале, дама и поп пика образуват кварта за 50. Включените в нея терци не се броят отделно.',
  ),
  'hearts',
  '10s Js Qs Ks Ac 7d 9h Kh',
  '50',
)
const fourNines = declaration(
  'four-nines',
  copy('Four nines', 'Четири деветки'),
  copy(
    'Four nines form a carré worth 150. Only four jacks are worth more, at 200.',
    'Каре деветки струва 150 точки. Само каре валета носи повече, 200 точки.',
  ),
  'all-trumps',
  '9c 9d 9h 9s 7c Qd As Kh',
  '150',
)
const noDeclarations = declaration(
  'silent-sequence',
  copy('A silent sequence', 'Поредица без анонс'),
  copy(
    'No Trumps has no sequence, carré or Belot bonuses, even if your cards would qualify at another contract.',
    'На Без коз няма точки за поредици, карета или белот, дори картите да биха образували анонс при друг договор.',
  ),
  'no-trumps',
  '7d 8d 9d 10d Jd Ac Kh Qs',
  '0',
)
function score(
  id: string,
  title: Copy,
  prompt: Copy,
  explanation: Copy,
  state: Extract<StudyState, { kind: 'score' }>,
  expected: string,
  other: string[],
): Puzzle {
  return puzzle({
    id,
    title,
    prompt,
    explanation,
    rule: 'knowledge',
    category: 'score',
    difficulty: 'advanced',
    initialState: state,
    choices: other.map((v) => choice(v, v)),
    expectedActions: [expected],
  })
}
const split = score(
  'suit-rounding',
  copy('Round a suit contract', 'Закръгляне на боя'),
  copy(
    'Your team declared Hearts. How many scoreboard points does each team record?',
    'Твоят отбор е обявил Купа. Колко точки записват двата отбора?',
  ),
  copy(
    'Both scores end in six. Round the smaller one up and the larger one down. Your 96 becomes 9, their 66 becomes 7.',
    'И двата резултата завършват на шест. По-малкият се закръгля нагоре, а по-големият надолу. Вашите 96 стават 9, техните 66 стават 7.',
  ),
  { kind: 'score', contract: 'hearts', raw: { us: 96, them: 66 }, bidder: 'us', multiplier: 1 },
  '9 : 7',
  ['10 : 7', '9 : 7', '10 : 6'],
)
const allRound = score(
  'all-trump-rounding',
  copy('The All Trumps boundary', 'Границата на Всичко коз'),
  copy('You made All Trumps. What goes on the scoreboard?', 'Изкарахте Всичко коз. Какво записвате?'),
  copy(
    'Both scores end in four. The smaller score rounds up to 13 and the larger rounds down to 13.',
    'Двата резултата завършват на четири. По-малкият се закръгля нагоре до 13, а по-големият надолу до 13.',
  ),
  { kind: 'score', contract: 'all-trumps', raw: { us: 134, them: 124 }, bidder: 'us', multiplier: 1 },
  '13 : 13',
  ['14 : 12', '13 : 12', '13 : 13'],
)
const capot = score(
  'doubled-capot',
  copy('A doubled capot', 'Капо с контра'),
  copy(
    'Your team wins every trick at No Trumps under Contra. What is the final award?',
    'Вземате всички взятки на Без коз с Контра. Колко точки записвате?',
  ),
  copy(
    'Card points with the last trick are doubled to 260. Add 90 for capot to reach 350, then apply Contra for 700 raw points, or 70 on the scoreboard.',
    'Картите с последното десет стават 260 след удвояването. Прибавяме 90 за капо, общо 350. Контрата удвоява до 700, които се записват като 70.',
  ),
  { kind: 'score', contract: 'no-trumps', raw: { us: 350, them: 0 }, bidder: 'us', multiplier: 2 },
  '70 : 0',
  ['52 : 0', '70 : 0', '88 : 0'],
)
const donate = cardProblem(
  'load-your-partner',
  'partner',
  'intermediate',
  copy('Give your partner points', 'Дай точки на партньора'),
  copy(
    'You play last and North is winning. Which discard gives your team the most points now?',
    'Играеш последен и Север печели. Коя карта носи най-много точки на отбора ти в тази взятка?',
  ),
  copy(
    'You have no clubs and your partner already owns the trick. Either ten adds 10 points. The better suit to keep depends on the remaining cards.',
    'Нямаш спатия, а партньорът ти вече печели взятката. И от двете десетки получавате още 10 точки. Коя боя е по-добре да запазиш зависи от оставащите карти.',
  ),
  'no-trumps',
  [play('east', '7c'), play('north', 'Ac'), play('west', 'Qc')],
  '10d 7h 10s',
  ['10d'],
  'donate',
  ['10s'],
)
const saveJack = cardProblem(
  'save-the-jack',
  'partner',
  'advanced',
  copy('Win at the lowest cost', 'Спечели с по-слабата карта'),
  copy(
    'You play last. Which winning card preserves the stronger trump?',
    'Играеш последен. С коя карта печелиш, като запазваш по-силния си коз?',
  ),
  copy(
    'Both the nine and jack beat the ace of hearts. The nine secures this trick and leaves the unbeatable jack in your hand.',
    'И деветката, и валето бият асото купа. Деветката печели взятката, а непобедимото вале остава в ръката ти.',
  ),
  'hearts',
  [play('east', 'Ah'), play('north', '7h'), play('west', 'Kh')],
  'Jh 9h 8d',
  ['9h'],
  'cheapest-winner',
)
const tracking = puzzle({
  id: 'count-the-spades',
  category: 'tracking',
  difficulty: 'intermediate',
  rule: 'knowledge',
  title: copy('Count the missing spades', 'Преброй останалите пики'),
  prompt: copy(
    'How many spades are still concealed in other hands?',
    'Колко пики все още са скрити в чуждите ръце?',
  ),
  explanation: copy(
    'There are eight spades in the deck. Subtract five played spades and the two in your hand, leaving one unaccounted for.',
    'В колодата има осем пики. Пет вече са изиграни, а две са в ръката ти. В чуждите ръце остава една.',
  ),
  initialState: {
    kind: 'count',
    contract: 'clubs',
    suit: 'spades',
    seen: hand('7s 8s 10s Qs Ks'),
    hand: hand('As 9s'),
  },
  choices: ['0', '1', '2', '3'].map((v) => choice(v, v)),
  expectedActions: ['1'],
})

export const puzzles: Puzzle[] = [
  follow,
  ordinaryTrick,
  cut,
  over,
  higherBid,
  run,
  split,
  donate,
  trumpJack,
  noTrumpVoid,
  allClimb,
  offSuitJack,
  unableOver,
  partnerClimb,
  doubled,
  redoubled,
  strength,
  fourNines,
  noDeclarations,
  allRound,
  capot,
  tracking,
  saveJack,
  deckSize,
  seating,
]
