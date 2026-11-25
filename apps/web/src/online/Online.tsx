import { useCallback, useState } from 'react'
import { Modal } from '../Settings'
import type { Lang } from '../store'
import { Directory } from './Directory'
import { WaitingRoom } from './WaitingRoom'
import { OnlineTable } from './OnlineTable'
import { useMultiplayer } from './useMultiplayer'
import { onlineError } from './ui'
import type { Command } from '../../../../packages/multiplayer/src/protocol'

export function Online({ lang, offline }: { lang: Lang; offline: () => void }) {
  const net = useMultiplayer()
  const [viewingRoom, setViewingRoom] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [gameError, setGameError] = useState('')
  const gameSend = useCallback(
    async (command: Command) => {
      setGameError('')
      try {
        await net.send(command)
      } catch (error) {
        setGameError(error instanceof Error ? error.message : 'disconnected')
        throw error
      }
    },
    [net.send],
  )
  const guest = net.guest ?? { id: '', name: '' }
  const { room, game, connected, send } = net
  const onTable = !!(room && game && game.matchId === room.matchId && game.matchId !== viewingRoom)
  const bg = lang === 'bg'
  return (
    <>
      {room && game && onTable ? (
        <OnlineTable
          room={room}
          game={game}
          guest={guest}
          connected={connected}
          send={gameSend}
          onReturn={() => setViewingRoom(game.matchId)}
          onLeave={() => setLeaving(true)}
        />
      ) : room ? (
        <WaitingRoom
          lang={lang}
          guest={guest}
          room={room}
          connected={connected}
          send={send}
          onTable={game ? () => setViewingRoom(null) : undefined}
        />
      ) : (
        <Directory
          lang={lang}
          guest={guest}
          rooms={net.rooms}
          presence={net.presence}
          connected={connected}
          send={send}
          offline={offline}
        />
      )}
      {leaving && room && (
        <Modal label={bg ? 'Напускане на мача' : 'Leave match?'} close={() => setLeaving(false)}>
          <p>{bg ? 'Ще се върнеш в списъка със стаи.' : 'You will return to the room browser.'}</p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setLeaving(false)}>
              {bg ? 'Отказ' : 'Cancel'}
            </button>
            <button
              className="btn"
              onClick={() => {
                void gameSend({ type: 'room:leave' })
                  .then(() => {
                    setLeaving(false)
                    setViewingRoom(null)
                  })
                  .catch(() => {})
              }}
            >
              {bg ? 'Напусни' : 'Leave match'}
            </button>
          </div>
        </Modal>
      )}
      {(net.notice || gameError) && (
        <div className="online-notice notice" role="alert">
          <span>{onlineError(lang, net.notice ?? gameError)}</span>
          <button
            onClick={() => {
              net.clearNotice()
              setGameError('')
            }}
            aria-label={bg ? 'Затвори' : 'Dismiss'}
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
