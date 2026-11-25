import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChartNoAxesColumnIncreasing,
  Globe2,
  House,
  Menu,
  Puzzle,
  ScanSearch,
  Settings,
  Spade,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useClub } from './store'
import { completedHands } from './session'
import { Lobby, type Page } from './Lobby'
import { ConnectedTable } from './ConnectedTable'
import { Settings as SettingsScreen, Setup } from './Settings'
import { LearningScreen, readLearningProgress } from './learning'
import { Review } from './Review'
import { Statistics } from './Statistics'
import { t } from './i18n'
import { Online } from './online/Online'
const mainNav = [
  ['play', Spade],
  ['online', Users],
  ['learn', BookOpen],
  ['puzzles', Puzzle],
  ['analysis', ScanSearch],
  ['stats', ChartNoAxesColumnIncreasing],
] as const
const pages: Page[] = ['play', 'online', 'learn', 'puzzles', 'analysis', 'stats', 'settings', 'table']
function route(): Page {
  const value = location.hash.slice(1) as Page
  return pages.includes(value) && !(value === 'online' && location.protocol === 'file:') ? value : 'play'
}

export function App() {
  const { prefs, active, history, start, setPref, warning, dismissWarning } = useClub()
  const lang = prefs.lang
  const [page, setPage] = useState<Page>(route)
  const [drawer, setDrawer] = useState(false)
  const [setup, setSetup] = useState<boolean | null>(null)
  const [reviewId, setReviewId] = useState<string>()
  const [learningProgress, setProgress] = useState(readLearningProgress)
  const menuRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const read = () => {
      setPage(route())
      setDrawer(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = 'Belot Club · ' + t(lang, page === 'play' ? 'lobby' : page)
    document.documentElement.dataset.motion = prefs.motion ? 'on' : 'off'
  }, [lang, page, prefs.motion])
  useEffect(() => {
    if (!drawer) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false)
      if (e.key === 'Tab' && buttons?.length) {
        const first = buttons[0],
          last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', key)
      menuRef.current?.focus()
    }
  }, [drawer])
  const goto = (p: Page) => {
    if (p !== 'table' && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    setDrawer(false)
    setPage(p)
    location.hash = p
    window.scrollTo(0, 0)
  }
  const review = (id: string) => {
    setReviewId(id)
    goto('analysis')
  }
  const openTable = () => {
    if (!active || active.view('south').phase === 'MATCH_COMPLETE')
      start({ target: prefs.target }, prefs.difficulty)
    goto('table')
  }
  const visiblePage = page === 'table' && !active ? 'play' : page
  const needsFullHistory = visiblePage === 'analysis' || visiblePage === 'stats'
  const currentRecord = needsFullHistory || visiblePage === 'play' ? active?.record : undefined
  const records = useMemo(
    () => (currentRecord ? [...history, currentRecord] : history),
    [history, currentRecord],
  )
  const hands = useMemo(
    () => (needsFullHistory ? records.flatMap(completedHands) : []),
    [records, needsFullHistory],
  )
  const selected = visiblePage === 'table' ? 'play' : visiblePage
  const makeLink = (p: Page) => {
    if (p === 'analysis') setReviewId(undefined)
    goto(p)
  }
  useEffect(() => {
    if (page === 'table' && !useClub.getState().active) start({ target: prefs.target }, prefs.difficulty)
  }, [page, start, prefs.target, prefs.difficulty])
  if (visiblePage === 'online') return <Online lang={lang} offline={() => goto('play')} />
  if (visiblePage === 'table' && active) {
    return (
      <main className="match-viewport" id="content">
        <ConnectedTable
          active={active}
          home={() => goto('play')}
          review={review}
          setup={() => setSetup(false)}
          restart={() => start(active.record.config, active.record.difficulty)}
        />
        {warning && (
          <div className="match-save-notice notice" role="alert">
            {t(lang, warning)}
            <button className="icon-button" onClick={dismissWarning} aria-label={t(lang, 'close')}>
              <X size={16} />
            </button>
          </div>
        )}
        {setup !== null && (
          <Setup
            lang={lang}
            practice={setup}
            close={() => setSetup(null)}
            onStart={() => {
              setSetup(null)
              goto('table')
            }}
          />
        )}
      </main>
    )
  }
  return (
    <div className="app-shell">
      <a
        className="skip"
        href="#content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('content')?.focus()
        }}
      >
        {t(lang, 'skip')}
      </a>
      {drawer && <div className="nav-backdrop" onClick={() => setDrawer(false)} />}
      <aside
        ref={navRef}
        className={'sidebar ' + (drawer ? 'open' : '')}
        aria-label={t(lang, 'navigation')}
      >
        <div className="brand-row">
          <button className="brand" onClick={() => goto('play')} aria-label="Belot Club">
            <img src="/spade.svg" alt="" />
            <span>
              Belot <em>Club</em>
            </span>
          </button>
          <button
            className="mobile-close icon-button"
            onClick={() => setDrawer(false)}
            aria-label={t(lang, 'close')}
          >
            <X />
          </button>
        </div>
        <nav className="nav-links">
          <div className="nav-label">{t(lang, 'navigation')}</div>
          {mainNav
            .filter(([p]) => p !== 'online' || location.protocol !== 'file:')
            .map(([p, Icon]) => (
              <button
                key={p}
                aria-label={t(lang, p)}
                title={t(lang, p)}
                aria-current={selected === p ? 'page' : undefined}
                onClick={() => makeLink(p)}
              >
                <Icon size={20} />
                <span>{t(lang, p)}</span>
                {selected === p && <i />}
              </button>
            ))}
          <div className="nav-separator" />
          <button
            aria-label={t(lang, 'settings')}
            title={t(lang, 'settings')}
            aria-current={selected === 'settings' ? 'page' : undefined}
            onClick={() => goto('settings')}
          >
            <Settings size={20} />
            <span>{t(lang, 'settings')}</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="club-ornament" aria-hidden="true">
            <i />♣ <b>♦</b> ♥ ♠<i />
          </div>
          <div className="guest">
            <span className="guest-avatar">
              <UserRound size={19} />
            </span>
            <div>
              <strong>{t(lang, 'guest')}</strong>
              <small>{t(lang, 'profile')}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <button
            ref={menuRef}
            className="menu-toggle icon-button"
            aria-expanded={drawer}
            aria-label={t(lang, 'menu')}
            onClick={() => setDrawer(true)}
          >
            <Menu />
          </button>
          <div className="crumb">
            <House size={16} />
            <span>{t(lang, 'club')}</span>
            <ChevronRight size={13} />
            <b>{t(lang, visiblePage === 'table' ? 'table' : selected)}</b>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i />
              {t(lang, 'offline')}
            </span>
            <i className="top-divider" />
            <label className="language-picker">
              <Globe2 size={16} />
              <select
                aria-label={t(lang, 'language')}
                value={lang}
                onChange={(e) => setPref('lang', e.target.value as 'bg' | 'en')}
              >
                <option value="bg">BG</option>
                <option value="en">EN</option>
              </select>
              <ChevronDown size={12} />
            </label>
          </div>
        </header>
        <main id="content" tabIndex={-1} className="content" key={visiblePage}>
          {warning && (
            <div className="notice warning" role="alert">
              {t(lang, warning)}
              <button className="icon-button" onClick={dismissWarning} aria-label={t(lang, 'close')}>
                <X size={16} />
              </button>
            </div>
          )}
          {visiblePage === 'play' && (
            <Lobby
              lang={lang}
              prefs={prefs}
              active={active}
              records={records}
              lessons={learningProgress.lessonsCompleted.length}
              navigate={makeLink}
              start={openTable}
              setup={setSetup}
              review={review}
            />
          )}
          {(visiblePage === 'learn' || visiblePage === 'puzzles') && (
            <LearningScreen lang={lang} section={visiblePage} onProgressChange={setProgress} />
          )}
          {visiblePage === 'analysis' && (
            <Review lang={lang} hands={hands} initialId={reviewId} onPlay={openTable} />
          )}
          {visiblePage === 'stats' && <Statistics lang={lang} hands={hands} records={records} />}
          {visiblePage === 'settings' && <SettingsScreen lang={lang} />}
        </main>
      </div>
      {setup !== null && (
        <Setup
          lang={lang}
          practice={setup}
          close={() => setSetup(null)}
          onStart={() => {
            setSetup(null)
            goto('table')
          }}
        />
      )}
    </div>
  )
}
