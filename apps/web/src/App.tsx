import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useClub } from './store'
import { completedHands } from './session'
import { Lobby, type Page } from './Lobby'
import { ConnectedTable } from './ConnectedTable'
import { Settings as SettingsScreen, Setup } from './Settings'
import { LearningScreen, useLearningProgress } from './learning'
import { Review } from './Review'
import { Statistics } from './Statistics'
import { t } from './i18n'
import { Online } from './online/Online'
import { useMultiplayer } from './online/useMultiplayer'
import { AppShell } from './AppShell'

const pages: Page[] = ['play', 'online', 'learn', 'puzzles', 'analysis', 'stats', 'settings', 'table']
function route(): Page {
  const value = location.hash.slice(1) as Page
  return pages.includes(value) && !(value === 'online' && location.protocol === 'file:') ? value : 'play'
}

export function App() {
  const { prefs, active, history, start, setPref, warning, dismissWarning } = useClub()
  const lang = prefs.lang
  const [page, setPage] = useState<Page>(route)
  const [setup, setSetup] = useState<boolean | null>(null)
  const [reviewId, setReviewId] = useState<string>()
  const [learningProgress, setProgress] = useLearningProgress()
  const [viewingRoom, setViewingRoom] = useState<string | null>(null)
  const online = page === 'online'
  const net = useMultiplayer(online)
  const showOnlineTable = !!(
    online &&
    net.room &&
    net.game &&
    net.game.matchId === net.room.matchId &&
    net.game.matchId !== viewingRoom
  )
  const visiblePage = page === 'table' && !active ? 'play' : page
  const immersive = visiblePage === 'table' || showOnlineTable

  useEffect(() => {
    const read = () => {
      setSetup(null)
      setPage(route())
    }
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
    document.title =
      'Belot Club · ' + t(lang, immersive ? 'table' : visiblePage === 'play' ? 'lobby' : visiblePage)
    document.documentElement.dataset.motion = prefs.motion ? 'on' : 'off'
  }, [lang, visiblePage, immersive, prefs.motion])
  useEffect(() => {
    if (page === 'table' && !useClub.getState().active) start({ target: prefs.target }, prefs.difficulty)
  }, [page, start, prefs.target, prefs.difficulty])

  function goto(destination: Page) {
    if (location.hash.slice(1) !== destination) location.hash = destination
  }
  function navigate(destination: Page) {
    if (destination === 'analysis') setReviewId(undefined)
    goto(destination)
  }
  function review(id: string) {
    setReviewId(id)
    goto('analysis')
  }
  function openTable() {
    if (!active || active.view('south').phase === 'MATCH_COMPLETE')
      start({ target: prefs.target }, prefs.difficulty)
    goto('table')
  }
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

  return (
    <AppShell
      page={visiblePage}
      immersive={immersive}
      lang={lang}
      onLanguage={(value) => setPref('lang', value)}
      navigate={navigate}
      connected={net.connected}
      inRoom={!!net.room}
      nickname={online || net.room ? net.guest?.name : undefined}
    >
      {warning && (
        <div className={(immersive ? 'match-save-notice' : 'warning') + ' notice'} role="alert">
          {t(lang, warning)}
          <button className="icon-button" onClick={dismissWarning} aria-label={t(lang, 'close')}>
            <X size={16} />
          </button>
        </div>
      )}
      <Online
        active={online}
        lang={lang}
        offline={() => goto('play')}
        net={net}
        showTable={showOnlineTable}
        onViewRoom={setViewingRoom}
      />
      {visiblePage === 'table' && active && (
        <ConnectedTable
          active={active}
          home={() => goto('play')}
          review={review}
          setup={() => setSetup(false)}
          restart={() => start(active.record.config, active.record.difficulty)}
        />
      )}
      {visiblePage === 'play' && (
        <Lobby
          lang={lang}
          prefs={prefs}
          active={active}
          records={records}
          lessons={learningProgress.lessonsCompleted.length}
          navigate={navigate}
          start={openTable}
          setup={setSetup}
          review={review}
        />
      )}
      {(visiblePage === 'learn' || visiblePage === 'puzzles') && (
        <LearningScreen
          key={visiblePage}
          lang={lang}
          section={visiblePage}
          progress={learningProgress}
          onProgressChange={setProgress}
        />
      )}
      {visiblePage === 'analysis' && (
        <Review lang={lang} hands={hands} initialId={reviewId} onPlay={openTable} />
      )}
      {visiblePage === 'stats' && (
        <Statistics lang={lang} hands={hands} records={records} progress={learningProgress} />
      )}
      {visiblePage === 'settings' && <SettingsScreen lang={lang} />}
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
    </AppShell>
  )
}
