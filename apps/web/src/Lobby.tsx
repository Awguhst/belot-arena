import {
  BookOpen,
  ChevronRight,
  Flag,
  History,
  Layers,
  Play,
  SlidersHorizontal,
  Users,
  GraduationCap,
} from 'lucide-react'
import { useMemo } from 'react'
import { createMatch, replayGame, type GameState } from '@belot/game-engine'
import type { LocalSession, MatchRecord } from './session'
import type { Lang, Preferences } from './store'
import { t } from './i18n'
export type Page = 'play' | 'online' | 'learn' | 'puzzles' | 'analysis' | 'stats' | 'settings' | 'table'
interface Props {
  lang: Lang
  prefs: Preferences
  active: LocalSession | null
  records: MatchRecord[]
  lessons: number
  navigate: (page: Page) => void
  start: () => void
  setup: (practice: boolean) => void
  review: (id: string) => void
}
type RecentMatch = Pick<GameState, 'handNumber' | 'scores' | 'winner'> & { id: string; date: string }
const recentScores = new WeakMap<MatchRecord, RecentMatch>()

export function recentScoredMatches(records: MatchRecord[]): RecentMatch[] {
  const scored = new Map<string, { record: MatchRecord; index: number }>()
  for (const record of records) {
    const index = record.events.findLastIndex(
      (event, i, events) =>
        (event.phase === 'NEXT_HAND' || event.phase === 'MATCH_COMPLETE') &&
        events[i - 1]?.phase === 'HAND_SCORING',
    )
    // Passed-out auctions can also end at NEXT_HAND. Only a scoring advance yields a result.
    if (index >= 0) scored.set(record.id, { record, index })
  }
  return [...scored.values()]
    .slice(-3)
    .reverse()
    .map(({ record, index }) => {
      const cached = recentScores.get(record)
      if (cached) return cached
      const { scores, winner, handNumber } = replayGame(
        createMatch(record.config, record.seed),
        record.events.slice(0, index + 1),
      )
      const summary = { id: record.id + '/' + handNumber, date: record.date, scores, winner, handNumber }
      recentScores.set(record, summary)
      return summary
    })
}

export function Lobby({ lang, prefs, active, records, lessons, navigate, start, setup, review }: Props) {
  const view = useMemo(() => active?.view('south'), [active])
  const ongoing = view && view.phase !== 'MATCH_COMPLETE'
  const target = ongoing ? view.target : prefs.target
  const recentMatches = useMemo(() => recentScoredMatches(records), [records])
  const shortDate = useMemo(
    () => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }),
    [lang],
  )
  const shortcuts = [
    {
      label: 'academy',
      text: 'academyDesc',
      art: 'academy',
      image: '/art/academy.webp',
      click: () => navigate('learn'),
    },
    {
      label: 'puzzles',
      text: 'puzzleDesc',
      art: 'puzzles',
      image: '/art/puzzles.webp',
      click: () => navigate('puzzles'),
    },
    {
      label: 'contractPractice',
      text: 'practiceDesc',
      art: 'practice',
      image: '/art/practice.webp',
      click: () => setup(true),
    },
  ] as const
  return (
    <div className="lobby">
      <div className="page-intro">
        <h1 className="page-title">{t(lang, 'lobby')}</h1>
        <p>{t(lang, 'welcome')}</p>
      </div>
      <section className="hero">
        <div className="hero-content">
          <div className="hero-kicker">
            <span className="kicker-rule" />
            {t(lang, 'single')}
          </div>
          <h2>{t(lang, 'classic')}</h2>
          <p>{t(lang, 'blurb')}</p>
          <div className="hero-meta">
            <span>
              <Users />
              {t(lang, 'teams')}
            </span>
            <i />
            <span>
              <Flag />
              {t(lang, 'to')} {target} {t(lang, 'pts')}
            </span>
          </div>
          <div className="hero-actions">
            <button className="btn hero-play" onClick={start}>
              <Play size={16} fill="currentColor" />
              {t(lang, ongoing ? 'resume' : 'playNow')}
            </button>
            {location.protocol !== 'file:' && (
              <button className="btn secondary" onClick={() => navigate('online')}>
                <Users size={16} />
                {t(lang, 'online')}
              </button>
            )}
            <button
              className="hero-setup"
              onClick={() => setup(false)}
              title={t(lang, 'options')}
              aria-label={t(lang, 'options')}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
        </div>
      </section>
      <section className="skills-section">
        <div className="section-head">
          <h2>{t(lang, 'trainTitle')}</h2>
          <span className="heading-rule" />
        </div>
        <div className="shortcuts">
          {shortcuts.map((s) => (
            <button className={'shortcut ' + s.art} key={s.art} onClick={s.click}>
              <div className="shortcut-art">
                <img src={s.image} alt="" />
              </div>
              <div className="shortcut-text">
                <h3>{t(lang, s.label)}</h3>
                <p>{t(lang, s.text)}</p>
              </div>
              <ChevronRight className="shortcut-link" size={17} />
            </button>
          ))}
        </div>
      </section>
      <div className="lower-grid">
        <section className="panel recent">
          <div className="widget-head">
            <h2>
              <History />
              {t(lang, 'history')}
            </h2>
            <button className="text-btn" onClick={() => navigate('analysis')}>
              {t(lang, 'allGames')}
              <ChevronRight size={15} />
            </button>
          </div>
          {recentMatches.length ? (
            <div>
              {recentMatches.map((h) => (
                <button key={h.id} className="record-row" onClick={() => review(h.id)}>
                  <span className="record-emblem">♠</span>
                  <span>
                    <strong>
                      {t(lang, h.winner ? (h.winner === 'us' ? 'won' : 'lost') : 'classic')}
                    </strong>
                    <small>
                      {shortDate.format(new Date(h.date))} · {t(lang, 'hand')} {h.handNumber}
                    </small>
                  </span>
                  <b>
                    {h.scores.us} : {h.scores.them}
                  </b>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-history">
              <div className="empty-icon">
                <Layers size={24} />
              </div>
              <div>
                <strong>{t(lang, 'noGames')}</strong>
                <p>{t(lang, 'noGamesHelp')}</p>
              </div>
            </div>
          )}
        </section>
        <section className="panel progress-card">
          <div className="widget-head">
            <h2>
              <GraduationCap />
              {t(lang, 'progress')}
            </h2>
          </div>
          <div className="progress-body">
            <div className="progress-label">
              <span>
                <BookOpen size={15} />
                {t(lang, 'lessonsDone')}
              </span>
              <b>
                {lessons} <small>/ 15</small>
              </b>
            </div>
            <progress max={15} value={lessons} />
            <button className="text-btn" onClick={() => navigate('learn')}>
              {t(lang, lessons ? 'continueLearning' : 'startLearning')}
              <ChevronRight size={15} />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
