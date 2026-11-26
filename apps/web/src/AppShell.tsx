import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ChevronRight,
  Globe2,
  House,
  Menu,
  Monitor,
  Puzzle,
  ScanSearch,
  Settings,
  Spade,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { Page } from './Lobby'
import type { Lang } from './store'
import { t } from './i18n'

const destinations = [
  ['play', Spade],
  ['online', Users],
  ['learn', BookOpen],
  ['puzzles', Puzzle],
  ['analysis', ScanSearch],
  ['stats', ChartNoAxesColumnIncreasing],
  ['settings', Settings],
] as const

interface Props {
  page: Page
  immersive: boolean
  connected: boolean
  inRoom: boolean
  nickname?: string
  lang: Lang
  onLanguage: (lang: Lang) => void
  navigate: (page: Page) => void
  children: ReactNode
}

export function AppShell({
  page,
  immersive,
  connected,
  inRoom,
  nickname,
  lang,
  onLanguage,
  navigate,
  children,
}: Props) {
  const [drawer, setDrawer] = useState(false)
  const aside = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLElement>(null)
  const previousView = useRef({ page, immersive })
  const online = page === 'online'
  const open = drawer && !immersive

  useEffect(() => {
    if (!open) return
    const media = window.matchMedia('(max-width: 760px)')
    const onResize = () => {
      if (!media.matches) setDrawer(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    aside.current?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDrawer(false)
      }
      if (event.key !== 'Tab') return
      const buttons = aside.current?.querySelectorAll<HTMLButtonElement>('button')
      if (!buttons?.length) return
      const first = buttons[0],
        last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    media.addEventListener('change', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      media.removeEventListener('change', onResize)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      if (media.matches) trigger.current?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (page === previousView.current.page && immersive === previousView.current.immersive) return
    previousView.current = { page, immersive }
    setDrawer(false)
    window.scrollTo(0, 0)
    if (!immersive && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (!document.querySelector('dialog[open]')) content.current?.focus({ preventScroll: true })
  }, [page, immersive])

  function go(destination: Page) {
    setDrawer(false)
    navigate(destination)
  }
  const connection = online ? (connected ? 'connected' : 'connecting') : 'offline'
  const StatusIcon = online ? (connected ? Wifi : WifiOff) : Monitor
  return (
    <div className={'app-shell' + (immersive ? ' immersive' : '')}>
      <a
        className="skip"
        hidden={immersive}
        href="#content"
        onClick={(e) => {
          e.preventDefault()
          content.current?.focus()
        }}
      >
        {t(lang, 'skip')}
      </a>
      {open && <div className="nav-backdrop" aria-hidden="true" onClick={() => setDrawer(false)} />}
      <aside
        id="club-sidebar"
        ref={aside}
        hidden={immersive}
        className={'sidebar' + (open ? ' open' : '')}
        aria-label={t(lang, 'navigation')}
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
      >
        <div className="brand-row">
          <button className="brand" onClick={() => go('play')} aria-label="Belot Club">
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
            <X size={19} />
          </button>
        </div>
        <nav className="nav-links" aria-label={t(lang, 'navigation')}>
          <div className="nav-label" aria-hidden="true">
            {t(lang, 'navigation')}
          </div>
          {destinations
            .filter(([p]) => p !== 'online' || location.protocol !== 'file:')
            .map(([p, Icon]) => (
              <button
                key={p}
                className={p === 'settings' ? 'nav-settings' : undefined}
                aria-label={t(lang, p)}
                title={t(lang, p)}
                aria-current={page === p ? 'page' : undefined}
                onClick={() => go(p)}
              >
                <Icon size={20} />
                <span>{t(lang, p)}</span>
                {page === p && <i aria-hidden="true" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="guest" title={nickname || t(lang, 'guest')}>
            <span className="guest-avatar">
              <UserRound size={19} />
            </span>
            <div>
              <strong>{nickname || t(lang, 'guest')}</strong>
              <small>{t(lang, nickname ? 'guestOnline' : 'profile')}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-body" inert={open || undefined}>
        {!immersive && (
          <header className="topbar">
            <div className="topbar-inner">
              <button
                ref={trigger}
                className="menu-toggle icon-button"
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-controls="club-sidebar"
                aria-label={t(lang, 'menu')}
                onClick={() => setDrawer(true)}
              >
                <Menu size={20} />
              </button>
              <div className="crumb">
                <House size={16} />
                <span>{t(lang, 'club')}</span>
                <ChevronRight size={13} />
                <b>{t(lang, page === 'play' ? 'lobby' : page)}</b>
              </div>
              <div className="top-actions">
                {inRoom && !online ? (
                  <button
                    className="return-room"
                    onClick={() => go('online')}
                    title={t(lang, 'returnRoom')}
                    aria-label={t(lang, 'returnRoom')}
                  >
                    <Users size={15} />
                    <span>{t(lang, 'returnRoom')}</span>
                  </button>
                ) : (
                  <span className={'connection ' + connection} role="status" title={t(lang, connection)}>
                    <i />
                    <StatusIcon size={16} aria-hidden="true" />
                    <span>{t(lang, connection)}</span>
                  </span>
                )}
                <i className="top-divider" aria-hidden="true" />
                <label className="language-picker">
                  <Globe2 size={16} />
                  <select
                    aria-label={t(lang, 'language')}
                    value={lang}
                    onChange={(e) => onLanguage(e.target.value as Lang)}
                  >
                    <option value="bg">BG</option>
                    <option value="en">EN</option>
                  </select>
                  <ChevronDown size={12} />
                </label>
              </div>
            </div>
          </header>
        )}
        <main
          id="content"
          ref={content}
          tabIndex={-1}
          className={immersive ? 'match-viewport' : 'content'}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
