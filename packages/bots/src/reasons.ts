const reasons = {
  forced: ['Това е единственото позволено действие.', 'This is the only legal action.'],
  weakBid: [
    'С тези пет карти обявата е рискована. Пасът оставя на партньора възможност да обяви.',
    'These five cards offer limited control. Passing leaves room for your partner to bid.',
  ],
  partnerBid: [
    'Партньорът вече е обявил. С пас подкрепяш договора на отбора.',
    'Your partner has already bid. Passing keeps your team’s contract in place.',
  ],
  suitBid: [
    'Дължината и силата в тази боя са основание да я предложиш за коз.',
    'The length and strength of this suit make it a promising trump choice.',
  ],
  allBid: [
    'При всичко коз валетата и деветките са най-силни във всяка боя. Тези карти подсилват ръката ти.',
    'With all trumps, jacks and nines control each suit. Your hand benefits from those rankings.',
  ],
  noBid: [
    'Асата и подкрепените десетки могат да донесат взятки без опасност от цакане.',
    'Aces and protected tens can win tricks without the risk of a ruff.',
  ],
  double: [
    'Имаш силни карти при тази обява. Контрата увеличава и печалбата, и риска.',
    'Your cards look strong against this contract. Doubling increases both the reward and the risk.',
  ],
  redouble: [
    'Ръката ти подкрепя договора на отбора. Реконтрата вдига залога четворно.',
    'Your hand supports your team’s contract. Redoubling makes the stake four times as large.',
  ],
  leadMaster: [
    'По-силните карти от боята вече са изиграни или са в ръката ти. Моментът е подходящ да потърсиш взятка.',
    'Higher cards of this suit are accounted for. This is a promising opportunity to take a trick.',
  ],
  lead: [
    'Този ход запазва възможности за следващите взятки, като отчита останалите карти в боята.',
    'This lead considers the remaining cards in the suit and preserves options for later tricks.',
  ],
  take: [
    'Картата поема взятката засега. Избери икономичен начин да спечелиш натрупаните точки.',
    'This card takes the lead. An economical winner helps collect the points already in the trick.',
  ],
  support: [
    'Партньорът води във взятката. Можеш да му дадеш точки и да запазиш силна карта за по-късно.',
    'Your partner is winning. You can contribute points while preserving a winner for later.',
  ],
  discard: [
    'Картата ограничава загубата на точки и запазва по-силните карти за следваща взятка.',
    'This card limits the points at risk and saves stronger cards for a later trick.',
  ],
  simulation: [
    'В разиграните възможни раздавания това действие даде най-добра средна оценка за отбора.',
    'Across sampled possible deals, this action had the highest estimated team score.',
  ],
  beginner: [
    'Това е един от позволените ходове в тази позиция.',
    'This is one of the legal choices in this position.',
  ],
} as const

export type DecisionReason = keyof typeof reasons
export function explainDecision(reason: DecisionReason, language: 'bg' | 'en'): string {
  return reasons[reason][language === 'bg' ? 0 : 1]
}
