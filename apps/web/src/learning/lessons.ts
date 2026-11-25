import { copy } from './model'
import type { Lesson } from './model'

export const lessons: Lesson[] = [
  {
    id: 'deck',
    topic: copy('The deck and the suits', 'Колодата и боите'),
    puzzleId: 'the-deck',
    explanation: copy(
      'Belot uses clubs, diamonds, hearts and spades. Each suit contains 7, 8, 9, 10, jack, queen, king and ace. A complete deal gives every player eight cards.',
      'В белота има четири бои — спатия, каро, купа и пика. Във всяка има 7, 8, 9, 10, вале, дама, поп и асо. След пълното раздаване всеки играч има осем карти.',
    ),
  },
  {
    id: 'teams',
    topic: copy('Partners and seats', 'Отбори и места'),
    puzzleId: 'opposite-seats',
    explanation: copy(
      'Four players form two partnerships. Partners sit opposite each other and share their points. Play moves counterclockwise, from South through East, North and West.',
      'Четирима играчи образуват два отбора. Партньорите седят един срещу друг и събират точките си. Редът е обратно на часовниковата стрелка — Юг, Изток, Север, Запад.',
    ),
  },
  {
    id: 'tricks',
    topic: copy('Winning a trick', 'Печелене на взятка'),
    puzzleId: 'ace-over-ten',
    explanation: copy(
      'Each player contributes one card. Unless someone trumps, the strongest card of the led suit wins. The winner collects all four cards and leads the next trick.',
      'Всеки играч поставя по една карта. Ако няма цакане, печели най-силната карта от поисканата боя. Победителят взема четирите карти и започва следващата взятка.',
    ),
  },
  {
    id: 'trump-rank',
    topic: copy('The trump ranking', 'Силата на козовете'),
    puzzleId: 'jack-of-trumps',
    explanation: copy(
      'Trumps rank J, 9, A, 10, K, Q, 8, 7 from strongest to weakest. In the other suits the order is A, 10, K, Q, J, 9, 8, 7.',
      'Силата на козовете намалява в реда В, 9, А, 10, П, Д, 8, 7. При некозовите бои редът е А, 10, П, Д, В, 9, 8, 7.',
    ),
  },
  {
    id: 'follow',
    topic: copy('Following suit', 'Отговаряне в боята'),
    puzzleId: 'follow-clubs',
    explanation: copy(
      'Look at the first card on the table. If you hold at least one card of that suit, you must play from it. This is true even when a different suit would win.',
      'Погледни първата карта на масата. Ако имаш поне една карта от тази боя, трябва да отговориш в нея. Това важи и когато с друга боя би спечелил.',
    ),
  },
  {
    id: 'ruff',
    topic: copy('Trumping and overtrumping', 'Цакане и надцакване'),
    puzzleId: 'overtrump-west',
    explanation: copy(
      'When void in the led suit and the opponents are winning, trump if you can. If an opponent has already trumped, overtrump when possible. If no trump in your hand beats theirs, you can discard.',
      'Ако нямаш от исканата боя и противникът печели, цакай, ако имаш коз. Ако противник вече е цакал, надцакай, когато можеш. Ако нямаш по-силен коз, можеш да чистиш.',
    ),
  },
  {
    id: 'nt',
    topic: copy('No Trumps', 'Без коз'),
    puzzleId: 'no-trump-discard',
    explanation: copy(
      'Each suit uses its ordinary strength. Follow the led suit whenever possible. If you cannot follow, choose any discard. At scoring, double card points and the last trick before adding any capot bonus.',
      'Всички бои имат обичайната си сила. Отговаряй в поисканата боя, когато можеш. Иначе можеш да чистиш всяка карта. При броенето удвои картите и последното десет, преди да прибавиш бонуса за капо.',
    ),
  },
  {
    id: 'at',
    topic: copy('All Trumps', 'Всичко коз'),
    puzzleId: 'all-trump-climb',
    explanation: copy(
      'Every suit uses trump strength. Follow the lead and beat the highest card of that suit if you can, including when your partner is winning. If you are void, your discard cannot win.',
      'Всяка боя е с козова сила. Отговори и качи най-силната карта в исканата боя, ако можеш, дори партньорът ти да печели. Ако си без боята, изчистената карта не печели взятката.',
    ),
  },
  {
    id: 'bidding',
    topic: copy('Reading a bid', 'Наддаване'),
    puzzleId: 'outbid-hearts',
    explanation: copy(
      'The auction starts with five cards. You can pass or name a higher contract. A pass still leaves you free to bid next time around. Three passes after a contract, Contra or Recontra end the auction.',
      'Наддаването започва с пет карти. Можеш да пасуваш или да обявиш по-висок договор. След пас можеш да наддаваш на следваща обиколка. Три паса след обява, контра или реконтра приключват наддаването.',
    ),
  },
  {
    id: 'declarations',
    topic: copy('Sequences and carrés', 'Поредици и карета'),
    puzzleId: 'four-card-run',
    explanation: copy(
      'At your first card, announce sequences of at least three consecutive ranks or qualifying four-of-a-kinds. Compare the two types separately. A trump king and queen are a separate 20-point Belot. Announce it when leading, following suit or trumping with the first card of the pair.',
      'При първата карта обяви поредица от поне три последователни карти в боя или допустимо каре. Двата вида се сравняват поотделно. Поп и дама коз носят още 20 точки за белот. Обявяваш го с първата карта от двойката, когато повеждаш, отговаряш в боята или цакаш.',
    ),
  },
  {
    id: 'points',
    topic: copy('Counting and rounding', 'Броене и закръгляне'),
    puzzleId: 'suit-rounding',
    explanation: copy(
      'Count the cards, the last trick and the bonuses before deciding who made the contract. Convert to scoreboard points afterwards. On a suit contract, two totals ending in six split the rounding in favour of the smaller total.',
      'Преброй картите, последното десет и бонусите, преди да определиш дали договорът е изкаран. После пресметни точките за записване. При игра на боя два резултата, завършващи на шест, се закръгляват в полза на по-малкия.',
    ),
  },
  {
    id: 'doubling',
    topic: copy('Contra and Recontra', 'Контра и реконтра'),
    puzzleId: 'double-the-bid',
    explanation: copy(
      'The defenders may double the active contract. The declaring side can redouble. At double or redouble the winner takes the entire multiplied result. A higher contract resets the multiplier.',
      'Защитниците могат да контрират текущия договор. Обявилият отбор може да даде реконтра. При контра и реконтра победителят взема целия умножен резултат. Нова, по-висока обява отменя множителя.',
    ),
  },
  {
    id: 'partner',
    topic: copy('Playing with a partner', 'Игра с партньор'),
    puzzleId: 'load-your-partner',
    explanation: copy(
      'Keep track of who currently holds the trick. When your partner is certain to take it, adding valuable cards can earn points safely. When others still have a turn, weigh the risk of a trump or a higher card.',
      'Следи чия е взятката в момента. Когато партньорът ти със сигурност я взема, можеш спокойно да му дадеш точки. Ако след теб още има играчи, прецени риска от цакане или по-силна карта.',
    ),
  },
  {
    id: 'counting',
    topic: copy('Tracking remaining cards', 'Следене на картите'),
    puzzleId: 'count-the-spades',
    explanation: copy(
      'Start with eight cards per suit. Cross out the ranks you hold and those already exposed. Pay attention when a player discards off-suit, since this shows they had no card of the led suit.',
      'Започни с осем карти във всяка боя. Извади своите карти и вече видените на масата. Когато играч чисти от друга боя, знаеш, че няма от поисканата.',
    ),
  },
  {
    id: 'economy',
    topic: copy('Preserving a winning card', 'Запазване на силна карта'),
    puzzleId: 'save-the-jack',
    explanation: copy(
      'In last position you know whether your card wins the trick. If two cards both win, consider spending the weaker one. The stronger card may control a later trick.',
      'Когато играеш последен, знаеш дали картата ти ще спечели. Ако две карти печелят, помисли дали да дадеш по-слабата. По-силната може да ти осигури следваща взятка.',
    ),
  },
]
