import { useState } from 'react'
import {
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Crown,
  DoorOpen,
  Flag,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Pencil,
  Play,
  Settings2,
  Shuffle,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import type { Seat } from '@belot/game-engine'
import type { Guest, RoomSeat, RoomSnapshot } from '../../../../packages/multiplayer/src/protocol'
import { Modal } from '../Settings'
import { t } from '../i18n'
import type { Lang } from '../store'
import { RoomChat } from './RoomChat'
import { RoomForm } from './RoomForm'
import {
  ErrorNotice,
  Monogram,
  NicknameDialog,
  PasswordDialog,
  Status,
  useRequest,
  type Send,
} from './ui'
import { ow, seatWord } from './words'
import './online.css'

interface Props {
  lang: Lang
  guest: Guest
  room: RoomSnapshot
  connected: boolean
  send: Send
  onTable?: () => void
}
const teams = [
  ['south', 'north'],
  ['west', 'east'],
] as const
const portraits: Record<Seat, string> = {
  north: '/art/elena.webp',
  east: '/art/martin.webp',
  west: '/art/boris.webp',
  south: '/art/elena.webp',
}

function ManageSeat({
  room,
  seat,
  lang,
  send,
  connected,
  close,
}: {
  room: RoomSnapshot
  seat: RoomSeat
  lang: Lang
  send: Send
  connected: boolean
  close: () => void
}) {
  const [destination, setDestination] = useState<Seat | ''>('')
  const [kicking, setKicking] = useState(false)
  const request = useRequest(lang)
  const choices = room.seats.filter((s) => s.seat !== seat.seat)
  return (
    <Modal label={ow(lang, 'manageSeat') + ' · ' + seatWord(lang, seat.seat)} close={close}>
      <div className="net-form">
        <p className="net-dialog-room">
          {seat.kind === 'bot' ? <Bot size={16} /> : <UserRound size={16} />}{' '}
          {seat.kind === 'human' ? seat.name : ow(lang, seat.kind === 'bot' ? 'bot' : 'reserved')}
        </p>
        <label className="net-field">
          <span>{ow(lang, 'move')}</span>
          <select
            aria-label={ow(lang, 'move')}
            value={destination}
            onChange={(e) => setDestination(e.target.value as Seat)}
          >
            <option value="">—</option>
            {choices.map((s) => (
              <option key={s.seat} value={s.seat}>
                {seatWord(lang, s.seat)} ·{' '}
                {s.kind === 'human' ? s.name : ow(lang, s.kind === 'bot' ? 'bot' : 'reserved')}
              </option>
            ))}
          </select>
        </label>
        <div className="net-manage-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={!destination || request.busy || !connected}
            onClick={() =>
              destination &&
              void request.run(
                () => send({ type: 'room:swap', a: seat.seat, b: destination, revision: room.revision }),
                close,
              )
            }
          >
            <ArrowLeftRight size={15} />
            {lang === 'bg' ? 'Размени местата' : 'Swap seats'}
          </button>
          {seat.kind !== 'human' && (
            <button
              className="btn secondary"
              disabled={!connected || request.busy}
              onClick={() =>
                void request.run(
                  () =>
                    send({
                      type: 'room:bot',
                      seat: seat.seat,
                      enabled: seat.kind === 'empty',
                      revision: room.revision,
                    }),
                  close,
                )
              }
            >
              <Bot size={15} />
              {ow(lang, seat.kind === 'empty' ? 'addBot' : 'removeBot')}
            </button>
          )}
          {seat.kind === 'human' && seat.guestId !== room.hostId && !kicking && (
            <button
              className="text-btn net-danger"
              disabled={!connected || request.busy}
              onClick={() => setKicking(true)}
            >
              {ow(lang, 'kick')}
            </button>
          )}
        </div>
        {kicking && (
          <div className="net-confirm">
            <p>
              {ow(lang, 'removeConfirm')} <strong>{seat.name}</strong>
            </p>
            <div className="net-manage-actions">
              <button type="button" className="btn secondary" onClick={() => setKicking(false)}>
                {ow(lang, 'cancel')}
              </button>
              <button
                className="btn"
                disabled={!connected || request.busy}
                onClick={() =>
                  void request.run(
                    () => send({ type: 'room:kick', guestId: seat.guestId!, revision: room.revision }),
                    close,
                  )
                }
              >
                {ow(lang, 'kickConfirm')}
              </button>
            </div>
          </div>
        )}
        <ErrorNotice text={request.error} />
      </div>
    </Modal>
  )
}
export function WaitingRoom({ lang, guest, room, connected, send, onTable }: Props) {
  const [dialog, setDialog] = useState<'name' | 'settings' | 'password' | null>(null)
  const [managed, setManaged] = useState<RoomSeat | null>(null)
  const host = guest.id === room.hostId,
    waiting = room.status === 'waiting' || room.status === 'ready'
  const completed = room.status === 'completed'
  const own = room.seats.find((s) => s.guestId === guest.id)
  const seat =
    managed &&
    room.seats.find(
      (s) => s.seat === managed.seat && s.kind === managed.kind && s.guestId === managed.guestId,
    )
  const request = useRequest(lang)
  const controls = connected && !request.busy
  const key = (seat: Seat) => room.seats.find((s) => s.seat === seat)!
  return (
    <main className="net-page net-waiting">
      <header className="net-mast">
        <div className="net-mast-inner">
          <div className="net-brand">
            <img src="/spade.svg" alt="" />
            <span>
              Belot <em>Club</em>
            </span>
          </div>
          <div className="net-mast-actions">
            <button
              className="net-offline"
              disabled={!controls}
              onClick={() => void request.run(() => send({ type: 'room:leave' }))}
            >
              <LogOut size={15} />
              {ow(lang, 'leave')}
            </button>
            <button
              className="net-identity"
              disabled={!connected || room.status === 'playing'}
              aria-label={ow(lang, 'editName')}
              onClick={() => setDialog('name')}
            >
              <Monogram name={guest.name} />
              <strong>{guest.name}</strong>
              <Pencil size={13} />
            </button>
          </div>
        </div>
      </header>
      <div className="net-main">
        <header className="net-room-heading">
          <div>
            <Status status={room.status} lang={lang} />
            <div className="net-room-name">
              <h1>{room.title}</h1>
              {room.locked && <LockKeyhole size={21} role="img" aria-label={ow(lang, 'locked')} />}
            </div>
            <p className="net-owner">
              <Crown size={14} />
              {ow(lang, 'host')} · {room.hostName}
            </p>
          </div>
          {host && waiting && (
            <div className="net-room-controls">
              <button
                className="net-secondary"
                disabled={!controls}
                onClick={() => setDialog('settings')}
              >
                <Settings2 size={16} />
                {ow(lang, 'settings')}
              </button>
              <button
                className="net-secondary"
                disabled={!controls}
                onClick={() => setDialog('password')}
              >
                <LockKeyhole size={15} />
                {ow(lang, 'password')}
              </button>
            </div>
          )}
        </header>
        {room.settings.description && <p className="net-description">{room.settings.description}</p>}
        {!connected && (
          <p className="net-error" role="status">
            <WifiOff size={16} />
            {ow(lang, 'retrying')}
          </p>
        )}
        <ErrorNotice text={request.error} />
        <div className="net-room-body">
          <section className="net-seating" aria-label={ow(lang, 'roomSeats')}>
            <div className="net-seating-head">
              <h2>{ow(lang, 'roomSeats')}</h2>
              {host && waiting && (
                <button
                  className="net-shuffle"
                  disabled={!controls}
                  onClick={() =>
                    void request.run(() => send({ type: 'room:randomize', revision: room.revision }))
                  }
                >
                  <Shuffle size={15} />
                  {ow(lang, 'shuffle')}
                </button>
              )}
            </div>
            <div className="net-teams">
              {teams.map((pair, idx) => (
                <section key={idx} className={'net-team net-team-' + idx}>
                  <h3>
                    <span />
                    {ow(lang, idx ? 'team2' : 'team1')}
                    <span />
                  </h3>
                  <div className="net-seat-pair">
                    {pair.map((compass) => {
                      const s = key(compass)
                      if (!s) return null
                      const mine = s.guestId === guest.id,
                        isHost = s.guestId === room.hostId
                      return (
                        <article
                          className={'net-seat net-seat-' + s.kind + (mine ? ' net-seat-own' : '')}
                          key={compass}
                          data-seat={compass}
                        >
                          <div className="net-seat-top">
                            <small>{seatWord(lang, compass)}</small>
                            {host && waiting && (
                              <button
                                title={ow(lang, 'manageSeat')}
                                aria-label={ow(lang, 'manageSeat')}
                                className="net-icon-action"
                                disabled={!controls}
                                onClick={() => setManaged(s)}
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            )}
                          </div>
                          <div className="net-occupant">
                            {s.kind === 'human' ? (
                              <Monogram name={s.name ?? ''} host={isHost} />
                            ) : s.kind === 'bot' ? (
                              <img className="net-bot-avatar" src={portraits[compass]} alt="" />
                            ) : (
                              <span className="net-vacancy">
                                <UserRound size={20} />
                              </span>
                            )}
                            <div>
                              <strong>
                                {s.kind === 'human'
                                  ? s.name
                                  : ow(lang, s.kind === 'bot' ? 'bot' : 'reserved')}
                              </strong>
                              {s.kind === 'human' && (
                                <small>
                                  {mine && ow(lang, 'you')}
                                  {mine && isHost ? ' · ' : ''}
                                  {isHost && ow(lang, 'host')}
                                  {!mine && !isHost && ow(lang, 'inRoom')}
                                </small>
                              )}
                              {s.kind === 'bot' && <small>{t(lang, room.settings.difficulty)}</small>}
                            </div>
                          </div>
                          {s.kind === 'empty' ? (
                            waiting && (
                              <button
                                className="net-seat-action"
                                disabled={!controls}
                                onClick={() =>
                                  void request.run(() =>
                                    send({ type: 'room:seat', seat: compass, revision: room.revision }),
                                  )
                                }
                              >
                                <DoorOpen size={14} />
                                {ow(lang, 'takeSeat')}
                              </button>
                            )
                          ) : (
                            <span
                              className={
                                'net-seat-state ' +
                                (s.kind === 'human' && !s.connected
                                  ? 'away'
                                  : s.kind === 'bot' || s.ready
                                    ? 'yes'
                                    : '')
                              }
                            >
                              {s.kind === 'human' && !s.connected ? (
                                <WifiOff size={13} />
                              ) : s.kind === 'bot' || s.ready ? (
                                <Check size={13} />
                              ) : (
                                <Clock3 size={13} />
                              )}
                              {ow(
                                lang,
                                s.kind === 'human' && !s.connected
                                  ? 'disconnected'
                                  : s.kind === 'bot' || s.ready
                                    ? 'ready'
                                    : 'notReady',
                              )}
                            </span>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="net-setting-strip">
              <span>
                <Flag />
                {room.target} {t(lang, 'pts')}
              </span>
              <span>
                <Users />
                {room.humans} / {room.humanCapacity}
              </span>
              <span>
                <Bot />
                {room.bots}
              </span>
              <span>
                <Clock3 />
                {room.settings.turnSeconds
                  ? room.settings.turnSeconds + ' ' + ow(lang, 'seconds')
                  : ow(lang, 'unlimited')}
              </span>
            </div>
            <details className="net-room-rules">
              <summary>{ow(lang, 'options')}</summary>
              <dl>
                <div>
                  <dt>{ow(lang, 'rules')}</dt>
                  <dd>{ow(lang, 'classic')}</dd>
                </div>
                <div>
                  <dt>{ow(lang, 'teamAssignment')}</dt>
                  <dd>{ow(lang, room.settings.teams)}</dd>
                </div>
                {(
                  [
                    ['allowHints', 'hints'],
                    ['allowEducation', 'education'],
                    ['replaceDisconnected', 'replace'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <dt>{ow(lang, label)}</dt>
                    <dd>{ow(lang, room.settings[key] ? 'enabled' : 'disabled')}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <div className="net-ready-bar">
              <p>
                {ow(
                  lang,
                  room.status === 'ready'
                    ? 'allReady'
                    : completed
                      ? 'completedHelp'
                      : room.status === 'playing'
                        ? 'playing'
                        : 'waitReady',
                )}
              </p>
              <div>
                {waiting && own && (
                  <button
                    className={'btn ' + (host || own.ready ? 'secondary' : '')}
                    disabled={!controls}
                    onClick={() =>
                      void request.run(() =>
                        send({ type: 'room:ready', ready: !own.ready, revision: room.revision }),
                      )
                    }
                  >
                    {own.ready ? <X size={16} /> : <CheckCheck size={16} />}{' '}
                    {ow(lang, own.ready ? 'unready' : 'readyUp')}
                  </button>
                )}
                {host && waiting && (
                  <button
                    className="btn"
                    disabled={!controls || room.status !== 'ready'}
                    onClick={() =>
                      void request.run(() => send({ type: 'room:start', revision: room.revision }))
                    }
                  >
                    <Play size={16} />
                    {ow(lang, 'start')}
                  </button>
                )}
                {onTable && (
                  <button className="btn secondary" onClick={onTable}>
                    <ArrowRight size={16} />
                    {lang === 'bg' ? 'Към масата' : 'Return to match'}
                  </button>
                )}
                {host && completed && (
                  <button
                    className="btn"
                    disabled={!controls}
                    onClick={() =>
                      void request.run(() => send({ type: 'room:return', revision: room.revision }))
                    }
                  >
                    <ChevronRight size={16} />
                    {ow(lang, 'rematch')}
                  </button>
                )}
              </div>
            </div>
          </section>
          {room.status !== 'playing' && (
            <RoomChat
              key={room.id}
              room={room}
              guest={guest}
              lang={lang}
              connected={connected}
              send={send}
            />
          )}
        </div>
      </div>
      {dialog === 'name' && room.status !== 'playing' && (
        <NicknameDialog
          lang={lang}
          guest={guest}
          send={send}
          connected={connected}
          close={() => setDialog(null)}
        />
      )}
      {dialog === 'settings' && host && waiting && (
        <RoomForm
          lang={lang}
          name={guest.name}
          room={room}
          send={send}
          connected={connected}
          close={() => setDialog(null)}
        />
      )}
      {dialog === 'password' && host && waiting && (
        <PasswordDialog
          lang={lang}
          title={room.title}
          locked={room.locked}
          edit
          connected={connected}
          close={() => setDialog(null)}
          submit={(password) => send({ type: 'room:password', password, revision: room.revision })}
        />
      )}
      {seat && host && waiting && (
        <ManageSeat
          lang={lang}
          room={room}
          seat={seat}
          send={send}
          connected={connected}
          close={() => setManaged(null)}
        />
      )}
    </main>
  )
}
