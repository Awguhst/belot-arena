import { useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Check, Crown, LockKeyhole, UserRound } from 'lucide-react'
import type { Command, Guest, RoomStatus } from '../../../../packages/multiplayer/src/protocol'
import type { Lang } from '../store'
import { Modal } from '../Settings'
import { ow, type Word } from './words'

export type Send = (command: Command) => Promise<void>
const errors: Record<string, [string, string]> = {
  invalid: [
    'Провери въведените данни и опитай пак.',
    'Check the information you entered and try again.',
  ],
  rate_limited: [
    'Твърде много опити. Изчакай малко и опитай пак.',
    'Too many attempts. Wait a moment and try again.',
  ],
  duplicate: ['Тази заявка вече е обработена.', 'That request was already processed.'],
  name_required: ['Първо избери псевдоним.', 'Choose a nickname first.'],
  already_in_room: ['Вече участваш в стая.', 'You are already in a room.'],
  room_missing: ['Стаята е затворена.', 'That room has closed.'],
  room_full: ['Последното място вече е заето.', 'The last seat has been taken.'],
  room_busy: ['Стаята вече не приема играчи.', 'That room is no longer accepting players.'],
  wrong_password: ['Грешна парола за стаята.', 'Incorrect room password.'],
  forbidden: ['Нямаш разрешение за тази промяна.', 'You do not have permission to make that change.'],
  stale: [
    'Стаята се промени. Провери местата и опитай отново.',
    'The room changed. Check the current seats and try again.',
  ],
  seat_occupied: ['Мястото вече е заето.', 'That seat is already taken.'],
  not_ready: ['Всички играчи трябва да са готови.', 'Every player must be ready.'],
  match_active: ['Мачът вече започна.', 'The match has already started.'],
  capacity: [
    'Няма достатъчно свободни места за тази промяна.',
    'There is not enough space for that change.',
  ],
  kicked: ['Домакинът те отстрани от стаята.', 'The host removed you from the room.'],
  disconnected: [
    'Връзката прекъсна. Изчакай повторно свързване.',
    'Connection interrupted. Wait for the lobby to reconnect.',
  ],
  timeout: [
    'Отговорът се забави. Провери състоянието на стаята и опитай пак.',
    'The server took too long to respond. Check the room and try again.',
  ],
  seat_expired: [
    'Мястото ти вече не е запазено. Можеш да избереш стая от списъка.',
    'Your seat reservation ended. You can choose a room from the directory.',
  ],
}
export function onlineError(lang: Lang, value: unknown) {
  const code = value instanceof Error ? value.message : String(value)
  return errors[code]?.[lang === 'bg' ? 0 : 1] ?? ow(lang, 'genericError')
}
export function ErrorNotice({ text }: { text: string }) {
  return text ? (
    <p className="net-error" role="alert">
      <AlertCircle size={16} />
      {text}
    </p>
  ) : null
}
/** Prevents duplicate clicks while the authority processes a command. */
export function useRequest(lang: Lang) {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false),
    [code, setCode] = useState('')
  function setError(error: unknown) {
    setCode(error instanceof Error ? error.message : String(error))
  }
  async function run(action: () => Promise<void>, success?: () => void) {
    if (lock.current) return
    lock.current = true
    setError('')
    setBusy(true)
    try {
      await action()
      success?.()
    } catch (e) {
      setError(e)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { run, busy, error: code ? onlineError(lang, code) : '', setError }
}
const statuses: Record<RoomStatus, Word> = {
  waiting: 'waiting',
  ready: 'readyRoom',
  playing: 'playing',
  completed: 'completed',
  closed: 'closed',
}
export function Status({ lang, status }: { lang: Lang; status: RoomStatus }) {
  return (
    <span className={'net-status net-' + status}>
      <i />
      {ow(lang, statuses[status])}
    </span>
  )
}
export function Monogram({ name, host = false }: { name: string; host?: boolean }) {
  const initials = Array.from(name.trim()).slice(0, 1).join('').toLocaleUpperCase()
  const color = Array.from(name).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4
  return (
    <span className={'net-avatar net-tone-' + color} aria-hidden="true">
      {initials || <UserRound size={16} />} {host && <Crown className="net-avatar-crown" size={11} />}
    </span>
  )
}
function NicknameForm({
  name = '',
  lang,
  send,
  close,
  connected = true,
}: {
  name?: string
  lang: Lang
  send: Send
  close?: () => void
  connected?: boolean
}) {
  const request = useRequest(lang)
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('nickname') ?? '').trim()
    if (name) void request.run(() => send({ type: 'guest:name', name }), close)
  }
  const submitButton = (
    <button className="btn" disabled={request.busy || !connected}>
      <Check size={15} />
      {ow(lang, close ? 'save' : 'enterLobby')}
    </button>
  )
  return (
    <form onSubmit={submit} className={close ? 'net-form' : 'net-name-form'}>
      {close && <p className="net-form-note">{ow(lang, 'nameHelp')}</p>}
      <label className="net-field">
        <span>{ow(lang, 'nickname')}</span>
        <input
          name="nickname"
          placeholder={ow(lang, 'namePlaceholder')}
          defaultValue={name}
          maxLength={24}
          required
          pattern=".*\S.*"
          autoFocus={!!close}
          autoComplete="nickname"
        />
      </label>
      {close ? (
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={close}>
            {ow(lang, 'cancel')}
          </button>
          {submitButton}
        </div>
      ) : (
        submitButton
      )}
      <ErrorNotice text={request.error} />
    </form>
  )
}
export function NicknameEntry({ lang, send }: { lang: Lang; send: Send }) {
  return (
    <section className="net-nickname-entry" aria-labelledby="net-nickname-title">
      <h2 id="net-nickname-title">{ow(lang, 'nameTitle')}</h2>
      <NicknameForm lang={lang} send={send} />
    </section>
  )
}
export function NicknameDialog({
  guest,
  lang,
  send,
  connected,
  close,
}: {
  guest: Guest
  lang: Lang
  send: Send
  connected: boolean
  close: () => void
}) {
  return (
    <Modal label={ow(lang, 'editName')} close={close}>
      <NicknameForm name={guest.name} lang={lang} send={send} connected={connected} close={close} />
    </Modal>
  )
}
export function PasswordDialog({
  lang,
  title,
  locked,
  edit,
  close,
  submit,
  connected,
}: {
  lang: Lang
  title: string
  locked: boolean
  edit?: boolean
  close: () => void
  submit: (password: string) => Promise<void>
  connected: boolean
}) {
  const request = useRequest(lang)
  const [remove, setRemove] = useState(false)
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = remove ? '' : String(new FormData(e.currentTarget).get('password') ?? '')
    if (new TextEncoder().encode(password).length > 128) {
      request.setError('invalid')
      return
    }
    void request.run(() => submit(password), close)
  }
  return (
    <Modal label={ow(lang, edit ? 'password' : 'joinLocked')} close={close}>
      <form className="net-form" onSubmit={save}>
        <p className="net-dialog-room">
          <LockKeyhole size={17} />
          {title}
        </p>
        {edit && locked && (
          <label className="net-check">
            <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
            {ow(lang, 'removePassword')}
          </label>
        )}
        {!remove && (
          <label className="net-field">
            <span>{ow(lang, edit && locked ? 'newPassword' : 'password')}</span>
            <input
              name="password"
              type="password"
              autoComplete={edit ? 'new-password' : 'off'}
              maxLength={128}
              required
              autoFocus
            />
          </label>
        )}
        <ErrorNotice text={request.error} />
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={close}>
            {ow(lang, 'cancel')}
          </button>
          <button className="btn" disabled={request.busy || !connected}>
            {ow(lang, edit ? 'save' : 'join')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
