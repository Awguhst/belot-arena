import { useState, type FormEvent } from 'react'
import { Bot, Crown, DoorOpen, Flag, LockKeyhole, Settings2, UserRound, Users } from 'lucide-react'
import { RULESET, SEATS } from '@belot/game-engine'
import {
  defaultRoomSettings,
  type RoomSettings,
  type RoomSnapshot,
} from '../../../../packages/multiplayer/src/protocol'
import { Modal } from '../Settings'
import { t } from '../i18n'
import type { Lang } from '../store'
import { ErrorNotice, useRequest, type Send } from './ui'
import { ow, seatWord } from './words'

const prefKey = 'belot.online.room-settings'
const levels = ['beginner', 'intermediate', 'advanced'] as const
function readPreferences(): RoomSettings {
  const settings = { ...defaultRoomSettings }
  try {
    const raw = JSON.parse(localStorage.getItem(prefKey) ?? 'null')
    if (!raw || typeof raw !== 'object') return settings
    if (typeof raw.title === 'string') settings.title = raw.title.slice(0, 64)
    if (typeof raw.description === 'string') settings.description = raw.description.slice(0, 240)
    if ([1, 2, 3, 4].includes(raw.humanCapacity)) settings.humanCapacity = raw.humanCapacity
    if ([51, 101, 151].includes(raw.target)) settings.target = raw.target
    if (levels.includes(raw.difficulty)) settings.difficulty = raw.difficulty
    if (raw.teams === 'random') settings.teams = raw.teams
    if ([0, 15, 30, 60, 120].includes(raw.turnSeconds)) settings.turnSeconds = raw.turnSeconds
    for (const key of ['allowHints', 'allowEducation', 'replaceDisconnected'] as const)
      if (typeof raw[key] === 'boolean') settings[key] = raw[key]
  } catch {
    /* Room preferences are optional when browser storage is unavailable. */
  }
  return settings
}
interface Props {
  lang: Lang
  name: string
  room?: RoomSnapshot
  connected: boolean
  send: Send
  close: () => void
}
export function RoomForm({ lang, name, room, connected, send, close }: Props) {
  const [settings, setSettings] = useState<RoomSettings>(() =>
    room ? { ...room.settings } : readPreferences(),
  )
  const [protectedRoom, setProtected] = useState(false)
  const [original, setOriginal] = useState(room?.settings)
  const changed = room && JSON.stringify(original) !== JSON.stringify(room.settings)
  const request = useRequest(lang)
  const reserved = room?.seats.filter((s) => s.kind === 'human').length ?? 1
  const capacity = Math.max(settings.humanCapacity, reserved)
  function update<K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }))
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const clean = {
      ...settings,
      humanCapacity: capacity,
      title: settings.title.trim(),
      description: settings.description.trim(),
      ruleset: RULESET,
    }
    if (!clean.title) {
      request.setError('invalid')
      return
    }
    const pwd = String(new FormData(e.currentTarget).get('password') ?? '')
    if (new TextEncoder().encode(pwd).length > 128) {
      request.setError('invalid')
      return
    }
    void request.run(
      () =>
        room
          ? send({ type: 'room:settings', revision: room.revision, settings: clean })
          : send({ type: 'room:create', settings: clean, ...(protectedRoom ? { password: pwd } : {}) }),
      () => {
        try {
          localStorage.setItem(prefKey, JSON.stringify(clean))
        } catch {
          /* Server settings still apply. */
        }
        close()
      },
    )
  }
  return (
    <Modal label={ow(lang, room ? 'settings' : 'hostRoom')} close={close}>
      <form className="net-form net-room-form" onSubmit={submit}>
        <label className="net-field">
          <span>{ow(lang, 'roomTitle')}</span>
          <input
            autoFocus
            name="title"
            maxLength={64}
            required
            value={settings.title}
            onChange={(e) => update('title', e.target.value)}
          />
        </label>
        <label className="net-field">
          <span>{ow(lang, 'description')}</span>
          <input
            name="description"
            maxLength={240}
            value={settings.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </label>
        <div className="net-form-row">
          <label className="net-field">
            <span>
              <Users size={14} />
              {ow(lang, 'capacity')}
            </span>
            <select
              aria-label={ow(lang, 'capacity')}
              value={capacity}
              onChange={(e) => update('humanCapacity', +e.target.value)}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n} disabled={n < reserved}>
                  {n} / 4
                </option>
              ))}
            </select>
          </label>
          <label className="net-field">
            <span>
              <Flag size={14} />
              {ow(lang, 'pointTarget')}
            </span>
            <select
              aria-label={ow(lang, 'pointTarget')}
              value={settings.target}
              onChange={(e) => update('target', +e.target.value as RoomSettings['target'])}
            >
              {[51, 101, 151].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!room && (
          <div className="net-preview" role="group" aria-label={ow(lang, 'seatMap')}>
            {SEATS.map((seat, i) => {
              const Icon = i === 0 ? Crown : i >= settings.humanCapacity ? Bot : UserRound
              return (
                <div
                  key={seat}
                  className={i === 0 ? 'net-self' : i >= settings.humanCapacity ? 'net-bot' : 'net-open'}
                >
                  <Icon size={18} />
                  <strong>
                    {i === 0 ? name : ow(lang, i >= settings.humanCapacity ? 'bot' : 'reserved')}
                  </strong>
                  <small>
                    {settings.teams === 'manual' ? seatWord(lang, seat) : ow(lang, 'random')}
                  </small>
                </div>
              )
            })}
          </div>
        )}
        <label className="net-field">
          <span>
            <Bot size={14} />
            {t(lang, 'difficulty')}
          </span>
          <select
            aria-label={t(lang, 'difficulty')}
            value={settings.difficulty}
            onChange={(e) => update('difficulty', e.target.value as RoomSettings['difficulty'])}
          >
            {levels.map((x) => (
              <option key={x} value={x}>
                {t(lang, x)}
              </option>
            ))}
          </select>
        </label>
        {!room && (
          <>
            <label className="net-check">
              <input
                type="checkbox"
                checked={protectedRoom}
                onChange={(e) => setProtected(e.target.checked)}
              />
              <LockKeyhole size={15} />
              {ow(lang, 'passwordToggle')}
            </label>
            {protectedRoom && (
              <label className="net-field">
                <span>{ow(lang, 'password')}</span>
                <input
                  name="password"
                  type="password"
                  maxLength={128}
                  required
                  autoComplete="new-password"
                />
              </label>
            )}
          </>
        )}
        <details className="net-options">
          <summary>
            <Settings2 size={16} />
            {ow(lang, 'options')}
          </summary>
          <dl className="net-fixed-rule">
            <dt>{ow(lang, 'rules')}</dt>
            <dd>{ow(lang, 'classic')}</dd>
          </dl>
          <div className="net-form-row">
            <label className="net-field">
              <span>{ow(lang, 'teamAssignment')}</span>
              <select
                aria-label={ow(lang, 'teamAssignment')}
                value={settings.teams}
                onChange={(e) => update('teams', e.target.value as RoomSettings['teams'])}
              >
                {(['manual', 'random'] as const).map((x) => (
                  <option key={x} value={x}>
                    {ow(lang, x)}
                  </option>
                ))}
              </select>
            </label>
            <label className="net-field">
              <span>{ow(lang, 'timer')}</span>
              <select
                aria-label={ow(lang, 'timer')}
                value={settings.turnSeconds}
                onChange={(e) => update('turnSeconds', +e.target.value as RoomSettings['turnSeconds'])}
              >
                {[0, 15, 30, 60, 120].map((n) => (
                  <option key={n} value={n}>
                    {n ? n + ' ' + ow(lang, 'seconds') : ow(lang, 'unlimited')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(
            [
              ['allowHints', 'hints'],
              ['allowEducation', 'education'],
              ['replaceDisconnected', 'replace'],
            ] as const
          ).map(([key, label]) => (
            <label className="net-check" key={key}>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => update(key, e.target.checked)}
              />
              {ow(lang, label)}
            </label>
          ))}
        </details>
        {changed && (
          <div role="status">
            <p className="net-form-note">{ow(lang, 'settingsChanged')}</p>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setSettings({ ...room.settings })
                setOriginal(room.settings)
                request.setError('')
              }}
            >
              {ow(lang, 'reloadSettings')}
            </button>
          </div>
        )}
        <ErrorNotice text={request.error} />
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={close}>
            {ow(lang, 'cancel')}
          </button>
          <button className="btn" disabled={request.busy || !connected || changed}>
            <DoorOpen size={17} />
            {ow(lang, room ? 'save' : 'createRoom')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
