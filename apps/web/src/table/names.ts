import type { Seat } from '@belot/game-engine'
import type { Lang } from '../store'

const players = {
  south: ['Ти', 'You'],
  north: ['Елена', 'Elena'],
  west: ['Борис', 'Boris'],
  east: ['Мартин', 'Martin'],
} as const
export const playerName = (lang: Lang, seat: Seat) => players[seat][lang === 'bg' ? 0 : 1]
export const portraits = { north: '/art/elena.webp', west: '/art/boris.webp', east: '/art/martin.webp' }
const texts = {
  resetGame: ['Отначало', 'Reset game'],
  resetTitle: ['Игра отначало?', 'Reset this game?'],
  resetDetail: [
    'Новият мач започва при 0–0 със същите настройки.',
    'Start a fresh match at 0–0 with the same settings.',
  ],
  full: ['Цял екран', 'Fullscreen'],
  exitFull: ['Изход от цял екран', 'Exit fullscreen'],
  mute: ['Изключи звука', 'Mute sound'],
  unmute: ['Включи звука', 'Enable sound'],
  choose: ['Избери своята обява', 'Choose your bid'],
  opening: ['Първа обява', 'Opening bid'],
  currentBid: ['Текуща обява', 'Current bid'],
  tableMenu: ['Инструменти', 'Table tools'],
  assist: ['Помощ', 'Assistance'],
  coach: ['Треньор', 'Coach'],
  hud: ['Информация за играта', 'Game information'],
  tricksWon: ['Спечелени взятки', 'Tricks captured'],
  ourTrick: ['Взятка за нас', 'Our trick'],
  theirTrick: ['Взятка за тях', 'Their trick'],
  piles: ['Взятки', 'Tricks'],
  turn: ['На ход', 'To play'],
  southSeat: ['Юг', 'South'],
  myTeam: ['Твоят отбор', 'Your team'],
  theirTeam: ['Противников отбор', 'Opposing team'],
  live: ['На масата', 'At the table'],
  practice: ['Тренировъчна маса', 'Practice table'],
  passout: ['Раздаването приключи', 'Deal complete'],
  cinematic: ['Кинематографично', 'Cinematic'],
  standard: ['Стандартен', 'Standard'],
  learning: ['Обучение', 'Learning'],
  expert: ['Експерт', 'Expert'],
  hintAction: ['Подсказка', 'Hint'],
  waiting: ['Изчакай своя ред', 'Wait for your turn'],
  chooseCard: ['Избери карта', 'Choose a card'],
  deck: ['Тесте', 'Deck'],
  closed: ['Край на раздаването', 'Hand complete'],
  switchMotion: ['Пропусни анимацията', 'Skip animation'],
  fullUnavailable: [
    'Цял екран е недостъпен в този прозорец.',
    'Fullscreen is unavailable in this window.',
  ],
} as const
export const tableText = (lang: Lang, key: keyof typeof texts) => texts[key][lang === 'bg' ? 0 : 1]
