import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../Settings'
import type { Lang } from '../store'
import { Directory, useDirectoryView } from './Directory'
import { WaitingRoom } from './WaitingRoom'
import { OnlineTable } from './OnlineTable'
import type { Multiplayer } from './useMultiplayer'
import { ErrorNotice, onlineError, useRequest } from './ui'
import type { Command } from '../../../../packages/multiplayer/src/protocol'

interface Props {
  lang: Lang
  offline: () => void
  active: boolean
  net: Multiplayer
  showTable: boolean
  onViewRoom: (matchId: string | null) => void
}
export function Online({ active, ...props }: Props) {
  const view = useDirectoryView()
  if (active) return <OnlineScreen {...props} view={view} />
  const { notice, clearNotice } = props.net
  if (notice === 'kicked' || notice === 'room_missing' || notice === 'seat_expired') {
    return <OnlineNotice lang={props.lang} code={notice} dismiss={clearNotice} />
  }
  return null
}
function OnlineNotice({ lang, code, dismiss }: { lang: Lang; code: string; dismiss: () => void }) {
  return (
    <div className="online-notice notice" role="alert">
      <span>{onlineError(lang, code)}</span>
      <button
        type="button"
        className="icon-button"
        onClick={dismiss}
        aria-label={lang === 'bg' ? 'Затвори' : 'Dismiss'}
      >
        ×
      </button>
    </div>
  )
}
function OnlineScreen({
  lang,
  offline,
  net,
  showTable,
  onViewRoom,
  view,
}: Omit<Props, 'active'> & { view: ReturnType<typeof useDirectoryView> }) {
  const [leaving, setLeaving] = useState<string | null>(null)
  const leaveRequest = useRequest(lang)
  const matchId = net.game?.matchId
  const [failedMove, setFailedMove] = useState<{ matchId: string | undefined; code: string } | null>(
    null,
  )
  const gameError = failedMove && failedMove.matchId === matchId ? failedMove.code : ''
  const gameSend = useCallback(
    async (command: Command) => {
      setFailedMove(null)
      try {
        await net.send(command)
      } catch (error) {
        setFailedMove({ matchId, code: error instanceof Error ? error.message : 'disconnected' })
        throw error
      }
    },
    [net.send, matchId],
  )
  const guest = net.guest ?? { id: '', name: '' }
  const { room, game, connected, send } = net
  const roomId = room?.id ?? null
  const previousRoom = useRef(roomId)
  useEffect(() => {
    if (roomId === previousRoom.current) return
    previousRoom.current = roomId
    const main = document.getElementById('content')
    if (!main || main.closest('[inert]') || document.querySelector('dialog[open]')) return
    window.scrollTo(0, 0)
    main.focus({ preventScroll: true })
  }, [roomId])
  const bg = lang === 'bg'
  return (
    <>
      {room && game && showTable ? (
        <OnlineTable
          room={room}
          game={game}
          guest={guest}
          connected={connected}
          send={gameSend}
          onReturn={() => onViewRoom(game.matchId)}
          onLeave={() => {
            leaveRequest.setError('')
            setLeaving(game.matchId)
          }}
        />
      ) : room ? (
        <WaitingRoom
          key={room.id}
          lang={lang}
          guest={guest}
          room={room}
          connected={connected}
          send={send}
          onTable={game ? () => onViewRoom(null) : undefined}
        />
      ) : (
        <Directory
          lang={lang}
          guest={guest}
          rooms={net.rooms}
          presence={net.presence}
          connected={connected}
          retrying={net.retrying}
          restoringName={net.restoringName}
          view={view}
          send={send}
          offline={offline}
        />
      )}
      {leaving && showTable && leaving === game?.matchId && (
        <Modal label={bg ? 'Напускане на мача' : 'Leave match?'} close={() => setLeaving(null)}>
          <p>{bg ? 'Ще се върнеш в списъка със стаи.' : 'You will return to the room browser.'}</p>
          <ErrorNotice text={leaveRequest.error} />
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setLeaving(null)}>
              {bg ? 'Отказ' : 'Cancel'}
            </button>
            <button
              className="btn"
              disabled={!connected || leaveRequest.busy}
              onClick={() => {
                void leaveRequest.run(
                  () => send({ type: 'room:leave' }),
                  () => {
                    setLeaving(null)
                    onViewRoom(null)
                  },
                )
              }}
            >
              {bg ? 'Напусни' : 'Leave match'}
            </button>
          </div>
        </Modal>
      )}
      {(net.notice || (showTable && gameError)) && (
        <OnlineNotice
          lang={lang}
          code={net.notice ?? gameError}
          dismiss={() => {
            net.clearNotice()
            setFailedMove(null)
          }}
        />
      )}
    </>
  )
}
