import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  Flag,
  Hand,
  History,
  Layers,
  Lightbulb,
  Puzzle,
  Target,
  Trophy,
} from 'lucide-react'
import { CONTRACTS } from '@belot/game-engine'
import type { Contract } from '@belot/game-engine'
import { t, suits } from './i18n'
import type { Lang } from './store'
import type { MatchRecord, ReviewedHand } from './session'
import { lessons } from './learning/lessons'
import { puzzles } from './learning/puzzles'
import type { LearningProgress } from './learning/progress'
import './Statistics.css'

type Filter = 'all' | 'assisted' | 'unassisted'
const copy = {
  resultFilter: ['Филтър на резултатите', 'Results filter'],
  overview: ['Общ преглед', 'Overview'],
  completed: ['Завършени мачове', 'Completed matches'],
  declared: ['Твои договори', 'Your contracts'],
  made: ['Изкарани договори', 'Contracts made'],
  rate: ['Успеваемост', 'Success rate'],
  won: ['Победи', 'Wins'],
  lost: ['Загуби', 'Losses'],
  tied: ['Равни', 'Ties'],
  allStudy: ['От всички упражнения', 'Across all study sessions'],
  differential: ['Средна разлика', 'Avg. score margin'],
  more: ['Покажи цялата история', 'Show all history'],
  less: ['Покажи последните дати', 'Show recent dates'],
  assistance: [
    'Мачът се отчита с помощ, ако в него са ползвани учебни настройки, подсказка или връщане на ход.',
    'A match counts as assisted when learning aids, a hint or undo have been used.',
  ],
  empty: [
    'Завърши ръка, за да проследиш резултатите си по дати.',
    'Finish a hand to start your score history.',
  ],
  noFilteredHands: [
    'Няма завършени раздавания за избрания филтър.',
    'No completed hands match this filter.',
  ],
  showAll: ['Покажи всички резултати', 'Show all results'],
  handStats: ['Резултати от ръцете', 'Hand results'],
  teamCaps: ['Капо за нашия отбор', 'Team capots'],
  multiplier: ['Удвоени договори', 'Doubled contracts'],
  averageHelp: [
    'Средна разлика между записаните от двата отбора точки на ръка. Ръцете са групирани по начална дата на мача.',
    'Average scoreboard points per hand for your team minus the opponents. Hands are grouped by the match start date.',
  ],
} as const
type CopyKey = keyof typeof copy
interface ContractRow {
  played: number
  personal: number
  made: number
}
interface Outcome {
  won: number
  lost: number
  tied: number
}
interface DayRow {
  date: string
  hands: number
  pointsFor: number
  pointsAgainst: number
  declared: number
  made: number
}
export interface StatisticsProps {
  lang: Lang
  hands: ReviewedHand[]
  records: MatchRecord[]
  progress: LearningProgress
}

export function summarizeStatistics(hands: ReviewedHand[], records: MatchRecord[], filter: Filter) {
  const visible = (assisted: boolean) => filter === 'all' || assisted === (filter === 'assisted')
  const filtered = [...new Map(hands.map((hand) => [hand.id, hand])).values()].filter(
    (hand) => visible(hand.assisted) && hand.final.result,
  )
  const matchRecords = [...new Map(records.map((record) => [record.id, record])).values()].filter(
    (record) => visible(record.assisted),
  )
  const finishedMatches = new Map<string, ReviewedHand>()
  const contractRows = Object.fromEntries(
    CONTRACTS.map((key) => [key, { played: 0, personal: 0, made: 0 }]),
  ) as Record<Contract, ContractRow>
  const doubled: Record<2 | 4, Outcome> = {
    2: { won: 0, lost: 0, tied: 0 },
    4: { won: 0, lost: 0, tied: 0 },
  }
  let capots = 0,
    declared = 0,
    made = 0
  const byDate = new Map<string, DayRow>()

  for (const hand of filtered) {
    const state = hand.final
    const result = state.result!
    const row = contractRows[state.contract!]
    row.played++
    // A training contract is chosen before dealing and has no winning bid.
    const personal =
      state.bidder === 'south' &&
      state.bids.some((bid) => bid.seat === 'south' && bid.bid === state.contract)
    const contractMade = personal && result.outcome === 'made'
    if (personal) {
      row.personal++
      declared++
    }
    if (contractMade) {
      row.made++
      made++
    }
    if (result.capot === 'us') capots++
    if (state.winner) finishedMatches.set(hand.matchId, hand)
    if (state.multiplier > 1) {
      const key =
        result.raw.us > result.raw.them ? 'won' : result.raw.us < result.raw.them ? 'lost' : 'tied'
      doubled[state.multiplier as 2 | 4][key]++
    }
    const date = new Date(hand.date)
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    const daily = byDate.get(day) ?? {
      date: day,
      hands: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      declared: 0,
      made: 0,
    }
    daily.hands++
    daily.pointsFor += result.awarded.us
    daily.pointsAgainst += result.awarded.them
    daily.declared += Number(personal)
    daily.made += Number(contractMade)
    byDate.set(day, daily)
  }
  return {
    hands: filtered.length,
    matches: finishedMatches.size,
    victories: [...finishedMatches.values()].filter((hand) => hand.final.winner === 'us').length,
    declared,
    made,
    capots,
    doubled,
    contractRows,
    hints: matchRecords.reduce((n, record) => n + record.hints, 0),
    days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)),
  }
}

export function Statistics({ lang, hands, records, progress: learning }: StatisticsProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [allDays, setAllDays] = useState(false)
  const values = useMemo(() => summarizeStatistics(hands, records, filter), [hands, records, filter])
  const label = (key: CopyKey) => copy[key][lang === 'bg' ? 0 : 1]
  const percent = (a: number, total: number) =>
    total
      ? new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(a / total)
      : '—'
  const dayFormat = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  const marginFormat = new Intl.NumberFormat(lang, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  })
  const metrics = [
    { name: label('completed'), value: values.matches, icon: Flag },
    { name: t(lang, 'victories'), value: values.victories, icon: Trophy },
    { name: t(lang, 'winRate'), value: percent(values.victories, values.matches), icon: Target },
    { name: t(lang, 'hands'), value: values.hands, icon: Layers },
  ]
  return (
    <section className="club-stats">
      <header className="page-intro">
        <h1 className="page-title">{t(lang, 'stats')}</h1>
        <p>{t(lang, 'statsIntro')}</p>
      </header>
      <div className="stat-controls" role="group" aria-label={label('resultFilter')}>
        {(['all', 'assisted', 'unassisted'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(lang, value)}
          </button>
        ))}
      </div>
      <div className="stat-metrics" aria-label={label('overview')}>
        {metrics.map(({ name, value, icon: Icon }) => (
          <div className="stat-metric" key={name}>
            <Icon aria-hidden="true" size={19} />
            <strong>{value}</strong>
            <span>{name}</span>
          </div>
        ))}
      </div>
      <div className="stat-body">
        <section className="stat-panel stat-contracts">
          <h2>
            <Hand aria-hidden="true" />
            {t(lang, 'byContract')}
          </h2>
          <div className="stat-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t(lang, 'contract')}</th>
                  <th>{t(lang, 'hands')}</th>
                  <th>{label('declared')}</th>
                  <th>{t(lang, 'success')}</th>
                  <th>{label('rate')}</th>
                </tr>
              </thead>
              <tbody>
                {CONTRACTS.map((contract) => {
                  const row = values.contractRows[contract]
                  return (
                    <tr key={contract}>
                      <th scope="row">
                        <span aria-hidden="true" className={'stat-suit stat-' + contract}>
                          {suits[contract]}
                        </span>
                        {t(lang, contract)}
                      </th>
                      <td>{row.played}</td>
                      <td>{row.personal}</td>
                      <td>{row.made}</td>
                      <td>{percent(row.made, row.personal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="stat-table-total">
            <span>
              {t(lang, 'declared')} <b>{values.declared}</b>
            </span>
            <span>
              {label('made')} <b>{values.made}</b>
            </span>
          </div>
        </section>
        <section className="stat-panel stat-study">
          <h2>
            <BookOpen aria-hidden="true" />
            {t(lang, 'competitive')}
          </h2>
          <p className="stat-sub">{label('allStudy')}</p>
          {[
            {
              icon: BookOpen,
              title: t(lang, 'lessonsDone'),
              done: learning.lessonsCompleted.length,
              total: lessons.length,
            },
            {
              icon: Puzzle,
              title: t(lang, 'solved'),
              done: learning.puzzlesCompleted.length,
              total: puzzles.length,
            },
          ].map(({ icon: Icon, title, done, total }) => (
            <div className="stat-learning-row" key={title}>
              <div>
                <Icon size={16} aria-hidden="true" />
                <span>{title}</span>
                <b>
                  {done} / {total}
                </b>
              </div>
              <progress aria-label={title} value={done} max={total} />
            </div>
          ))}
          <div className="stat-line">
            <CheckCheck aria-hidden="true" />
            <span>{t(lang, 'accuracy')}</span>
            <b>{percent(learning.puzzleCorrect, learning.puzzleAttempts)}</b>
          </div>
        </section>
        <section className="stat-panel stat-hands">
          <h2>
            <Flag aria-hidden="true" />
            {label('handStats')}
          </h2>
          <div className="stat-line">
            <Trophy aria-hidden="true" />
            <span>{label('teamCaps')}</span>
            <b>{values.capots}</b>
          </div>
          <div className="stat-line">
            <Lightbulb aria-hidden="true" />
            <span>{t(lang, 'hintsUsed')}</span>
            <b>{values.hints}</b>
          </div>
          <div className="stat-scroll">
            <table aria-label={label('multiplier')}>
              <thead>
                <tr>
                  <th>{t(lang, 'counter')}</th>
                  <th>{label('won')}</th>
                  <th>{label('lost')}</th>
                  <th>{label('tied')}</th>
                </tr>
              </thead>
              <tbody>
                {([2, 4] as const).map((multiplier) => (
                  <tr key={multiplier}>
                    <th scope="row">
                      {t(lang, multiplier === 2 ? 'contra' : 'recontra')} ×{multiplier}
                    </th>
                    <td>{values.doubled[multiplier].won}</td>
                    <td>{values.doubled[multiplier].lost}</td>
                    <td>{values.doubled[multiplier].tied}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="stat-panel stat-history">
          <h2>
            <History aria-hidden="true" />
            {t(lang, 'historyStats')}
          </h2>
          {values.days.length ? (
            <>
              <div className="stat-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t(lang, 'date')}</th>
                      <th>{t(lang, 'hands')}</th>
                      <th>{label('differential')}</th>
                      <th>{label('rate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {values.days.slice(0, allDays ? undefined : 7).map((day) => (
                      <tr key={day.date}>
                        <th scope="row">{dayFormat.format(new Date(day.date + 'T12:00:00'))}</th>
                        <td>{day.hands}</td>
                        <td>{marginFormat.format((day.pointsFor - day.pointsAgainst) / day.hands)}</td>
                        <td>{percent(day.made, day.declared)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="stat-sub">{label('averageHelp')}</p>
              {values.days.length > 7 && (
                <button type="button" className="stat-link" onClick={() => setAllDays(!allDays)}>
                  {label(allDays ? 'less' : 'more')}
                  <ArrowUpRight size={16} />
                </button>
              )}
            </>
          ) : filter !== 'all' && hands.length ? (
            <div className="stat-empty">
              <p>{label('noFilteredHands')}</p>
              <button type="button" className="text-btn" onClick={() => setFilter('all')}>
                {label('showAll')}
              </button>
            </div>
          ) : (
            <p className="stat-empty">{label('empty')}</p>
          )}
        </section>
      </div>
      <p className="stat-note">{label('assistance')}</p>
    </section>
  )
}
export default Statistics
