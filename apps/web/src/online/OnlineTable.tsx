import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Timer, WifiOff } from 'lucide-react'
import { chooseHeuristic } from '@belot/bots'
import { SEATS, type GameAction } from '@belot/game-engine'
import type {
  Command,
  Guest,
  MatchProjection,
  RoomSnapshot,
} from '../../../../packages/multiplayer/src/protocol'
import { Table } from '../Table'
import { Modal } from '../Settings'
import { t } from '../i18n'
import { useClub, type Lang, type Preferences } from '../store'
import { useTableAnimation } from '../table/animation'
import { roomReturnText, TableRoomContext, type TableRoom } from '../table/roomContext'
import { roomAction, tableAction, tableSeat, tableView } from './perspective'
import { seatWord } from './words'
import './onlineTable.css'

interface Props {
  room: RoomSnapshot
  game: MatchProjection
  guest: Guest
  connected: boolean
  send: (command: Command) => Promise<void>
  onReturn: () => void
  onLeave: () => void
}

export function matchPreferences(prefs: Preferences, hints: boolean, education: boolean): Preferences {
  return {
    ...prefs,
    undo: false,
    autoCoach: hints && prefs.autoCoach,
    bidAdvice: hints && prefs.bidAdvice,
    autoDeclare: hints && prefs.autoDeclare,
    highlights: education && prefs.highlights,
    points: education && prefs.points,
    rankings: education && prefs.rankings,
    tracker: education && prefs.tracker,
    reasons: education && prefs.reasons,
    winning: education && prefs.winning,
  }
}

function TurnStatus({
  deadline,
  connected,
  lang,
}: {
  deadline: number | null
  connected: boolean
  lang: Lang
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!deadline || !connected) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline, connected])
  if (!connected)
    return (
      <span className="room-turn-status offline" role="status">
        <WifiOff size={15} />
        {lang === 'bg' ? 'Свързване…' : 'Reconnecting…'}
      </span>
    )
  if (!deadline) return null
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  return (
    <span
      className="room-turn-status"
      role="timer"
      aria-label={lang === 'bg' ? 'Оставащо време за хода' : 'Turn time remaining'}
    >
      <Timer size={15} />
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  )
}

export function OnlineTable({ room, game, guest, connected, send, onReturn, onLeave }: Props) {
  const saved = useClub((state) => state.prefs)
  const { allowHints, allowEducation } = room.settings
  const prefs = useMemo(
    () => matchPreferences(saved, allowHints, allowEducation),
    [saved, allowHints, allowEducation],
  )
  const lang = prefs.lang
  // Keep the old DOM for one layout pass when a remote move arrives so its flight has a real source.
  const [presented, setPresented] = useState(game)
  const [submitted, setSubmitted] = useState(false)
  const pending = useRef<string | null>(null)
  const [confirmReturn, setConfirmReturn] = useState(false)
  const projection = presented.matchId === game.matchId ? presented : game
  const view = useMemo(() => tableView(projection.view), [projection])
  const legal = useMemo(
    () => projection.legal.map((a) => tableAction(a, projection.view.seat)),
    [projection],
  )
  const isHost = room.hostId === guest.id
  const seated = room.seats.find((s) => s.seat === projection.view.seat)?.guestId === guest.id
  const key = projection.matchId + '/' + view.revision
  const opening = useMemo(() => ({ id: game.matchId }), [game.matchId])
  const animation = useTableAnimation({
    view,
    opening: view.revision === 0 ? opening : null,
    sessionId: projection.matchId,
    speed: prefs.animationSpeed,
    motion: prefs.motion,
    expert: prefs.assistanceMode === 'expert',
    lang,
  })
  useLayoutEffect(() => {
    if (game === presented) return
    if (
      game.matchId === presented.matchId &&
      game.view.revision === presented.view.revision + 1 &&
      pending.current !== key
    )
      animation.capture()
    setPresented(game)
  }, [game, presented, key, animation.capture])
  useEffect(() => {
    pending.current = null
    setSubmitted(false)
  }, [key, connected])
  useEffect(() => {
    setConfirmReturn(false)
  }, [game.matchId, view.phase, isHost])
  const blocked = !connected || !seated || submitted || projection.view.revision !== game.view.revision

  const players = useMemo(() => {
    const out = {} as TableRoom['players']
    for (const absolute of SEATS) {
      const position = room.seats.find((s) => s.seat === absolute)
      const seat = tableSeat(absolute, projection.view.seat)
      const name =
        position?.kind === 'bot'
          ? position.name || (lang === 'bg' ? 'Бот' : 'Bot') + ' · ' + seatWord(lang, absolute)
          : position?.name || '—'
      out[seat] = {
        name,
        human: position?.kind === 'human',
        connected: !!position?.connected,
        roomSeat: absolute,
      }
    }
    return out
  }, [room.seats, projection.view.seat, lang])

  function submit(action: GameAction) {
    if (blocked || pending.current === key || animation.locked || action.revision !== view.revision)
      return
    if (
      action.type === 'advance'
        ? view.phase !== 'NEXT_HAND'
        : action.seat !== 'south' || view.turn !== 'south'
    )
      return
    pending.current = key
    setSubmitted(true)
    animation.capture(action)
    void send({
      type: 'game:action',
      matchId: projection.matchId,
      action: roomAction(action, projection.view.seat),
    }).catch(() => {
      if (pending.current === key) {
        pending.current = null
        setSubmitted(false)
      }
    })
  }
  function requestHint() {
    if (blocked || animation.locked || !allowHints || prefs.assistanceMode === 'expert' || !legal.length)
      return null
    return chooseHeuristic(view, legal, { difficulty: 'intermediate' })
  }
  function returnGroup() {
    setConfirmReturn(false)
    if (!connected || !isHost) return
    void send({ type: 'room:return', revision: room.revision })
      .then(onReturn)
      .catch(() => {})
  }
  function returnToRoom() {
    if (isHost && view.phase === 'NEXT_HAND') setConfirmReturn(true)
    else if (isHost && view.phase === 'MATCH_COMPLETE') returnGroup()
    else onReturn()
  }
  return (
    <TableRoomContext.Provider
      value={{
        title: room.title,
        players,
        hints: allowHints,
        education: allowEducation,
        blocked,
        headerStatus: <TurnStatus deadline={game.deadline} connected={connected} lang={lang} />,
        canReturnAtHandEnd: isHost,
        returnToRoom,
      }}
    >
      <div className="online-table" data-room-id={room.id} data-own-seat={game.view.seat}>
        <Table
          key={projection.matchId}
          view={view}
          legal={legal}
          prefs={prefs}
          sessionId={projection.matchId}
          canUndo={false}
          undo={() => {}}
          submit={submit}
          requestHint={requestHint}
          animation={animation}
          home={onLeave}
        />
        {confirmReturn && (
          <Modal
            label={lang === 'bg' ? 'Връщане на всички в стаята?' : 'Return everyone to the room?'}
            close={() => setConfirmReturn(false)}
          >
            <p>
              {lang === 'bg'
                ? 'Текущият мач ще приключи. В стаята можете да смените отборите и да започнете нов мач.'
                : 'This ends the current match. Everyone can choose teams and start another match in the room.'}
            </p>
            <div className="modal-actions">
              <button autoFocus className="btn secondary" onClick={() => setConfirmReturn(false)}>
                {t(lang, 'cancel')}
              </button>
              <button className="btn" disabled={!connected} onClick={returnGroup}>
                {roomReturnText(lang)}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </TableRoomContext.Provider>
  )
}
