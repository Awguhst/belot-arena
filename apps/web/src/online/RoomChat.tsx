import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, MessageCircle, Send as SendIcon, Volume2, VolumeX } from 'lucide-react'
import type { ChatEntry, Guest, RoomSnapshot } from '../../../../packages/multiplayer/src/protocol'
import type { Lang } from '../store'
import { t } from '../i18n'
import { ErrorNotice, useRequest, type Send } from './ui'
import { ow, seatWord } from './words'

const mutedKey = 'belot.online.muted'
function readMuted() {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(mutedKey) ?? '[]')
    return new Set<string>(
      Array.isArray(saved) ? saved.filter((id) => typeof id === 'string').slice(-256) : [],
    )
  } catch {
    return new Set<string>()
  }
}

function systemText(lang: Lang, m: ChatEntry) {
  const name = m.name || '',
    bg = lang === 'bg'
  switch (m.system) {
    case 'join':
      return bg ? name + ' влезе в стаята.' : name + ' joined the room.'
    case 'leave':
      return bg ? name + ' напусна стаята.' : name + ' left the room.'
    case 'kick':
      return bg ? name + ' беше отстранен от стаята.' : name + ' was removed from the room.'
    case 'host':
      return bg ? name + ' пое домакинството.' : name + ' is now the host.'
    case 'disconnect':
      return bg ? name + ' загуби връзка.' : name + ' disconnected.'
    case 'reconnect':
      return bg ? name + ' се свърза отново.' : name + ' reconnected.'
    case 'return':
      return bg ? 'Масата е отворена за реванш.' : 'The table is open for a rematch.'
    case 'start':
      return bg ? 'Мачът започна.' : 'The match has started.'
    case 'settings':
      return bg ? 'Настройките на стаята бяха обновени.' : 'The room settings were updated.'
    case 'ready':
      return m.ready === undefined
        ? m.text
        : m.ready
          ? bg
            ? name + ' е в готовност.'
            : name + ' is ready.'
          : bg
            ? name + ' отмени готовността си.'
            : name + ' is no longer ready.'
    case 'move':
      if (m.seat && m.otherSeat)
        return bg
          ? 'Разменени места: ' + seatWord(lang, m.seat) + ' и ' + seatWord(lang, m.otherSeat) + '.'
          : seatWord(lang, m.seat) + ' and ' + seatWord(lang, m.otherSeat) + ' swapped seats.'
      if (m.seat) return name + (bg ? ' зае мястото на ' : ' moved to ') + seatWord(lang, m.seat) + '.'
      return bg ? 'Отборите са разбъркани.' : 'The teams were shuffled.'
    case 'bot': {
      if (!m.seat || m.enabled === undefined) return m.text
      const where = seatWord(lang, m.seat)
      if (!m.enabled) return bg ? where + ' е свободно за играч.' : where + ' is now open for a player.'
      return bg
        ? 'Бот зае мястото на ' + where + (m.difficulty ? ' · ' + t(lang, m.difficulty) : '') + '.'
        : 'A bot joined ' + where + (m.difficulty ? ' · ' + t(lang, m.difficulty) : '') + '.'
    }
    default:
      return m.text
  }
}
export function RoomChat({
  room,
  lang,
  guest,
  send,
  connected,
}: {
  room: RoomSnapshot
  lang: Lang
  guest: Guest
  send: Send
  connected: boolean
}) {
  const [open, setOpen] = useState(true),
    [people, setPeople] = useState(false)
  const [muted, setMuted] = useState(readMuted)
  const input = useRef<HTMLInputElement>(null),
    log = useRef<HTMLUListElement>(null),
    follow = useRef(true)
  const request = useRequest(lang)
  const participants = room.seats.filter(
    (s) => s.kind === 'human' && s.guestId && s.guestId !== guest.id,
  )
  useEffect(() => {
    if (open && follow.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [room.chat, open])
  function submit(e: FormEvent) {
    e.preventDefault()
    const text = input.current?.value.trim()
    if (!text) return
    void request.run(
      () => send({ type: 'room:chat', text }),
      () => {
        if (input.current?.value.trim() === text) input.current.value = ''
        follow.current = true
      },
    )
  }
  function toggleMute(id: string) {
    const next = new Set(muted)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const retained = [...next].slice(-256)
    setMuted(new Set(retained))
    try {
      sessionStorage.setItem(mutedKey, JSON.stringify(retained))
    } catch {
      /* The mute still applies to the current waiting room. */
    }
  }
  return (
    <section className="net-chat" aria-label={ow(lang, 'chat')}>
      <div className="net-chat-head">
        <button onClick={() => setOpen(!open)} aria-expanded={open}>
          <MessageCircle size={17} />
          <h2>{ow(lang, 'chat')}</h2>
          <ChevronDown size={14} />
        </button>
        {open && participants.length > 0 && (
          <button
            className="net-icon-action"
            aria-expanded={people}
            aria-label={ow(lang, 'mutePlayers')}
            title={ow(lang, 'mutePlayers')}
            onClick={() => setPeople(!people)}
          >
            <Volume2 size={16} />
          </button>
        )}
      </div>
      {open && (
        <>
          {people && participants.length > 0 && (
            <div className="net-chat-people">
              {participants.map((s) => (
                <button
                  key={s.guestId}
                  className="net-mini"
                  aria-pressed={muted.has(s.guestId!)}
                  onClick={() => toggleMute(s.guestId!)}
                >
                  {muted.has(s.guestId!) ? <VolumeX size={13} /> : <Volume2 size={13} />}{' '}
                  {ow(lang, muted.has(s.guestId!) ? 'unmute' : 'mute')} {s.name}
                </button>
              ))}
            </div>
          )}
          <ul
            className="net-chat-log"
            ref={log}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={(e) => {
              const el = e.currentTarget
              follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 35
            }}
          >
            {room.chat
              .filter((m) => m.kind === 'system' || !m.guestId || !muted.has(m.guestId))
              .map((m) => (
                <li key={m.id} className={m.kind === 'system' ? 'net-system' : ''}>
                  {m.kind === 'system' ? (
                    <>
                      <i />
                      {systemText(lang, m)}
                    </>
                  ) : (
                    <>
                      <strong className={m.guestId === guest.id ? 'net-own' : ''}>{m.name}</strong>
                      <span>{m.text}</span>
                    </>
                  )}
                </li>
              ))}
          </ul>
          <form onSubmit={submit}>
            <input
              ref={input}
              name="chat"
              maxLength={280}
              autoComplete="off"
              aria-label={ow(lang, 'say')}
              placeholder={ow(lang, 'say')}
              required
              pattern=".*\S.*"
              disabled={!connected}
            />
            <button
              type="submit"
              className="net-send"
              aria-label={ow(lang, 'send')}
              title={ow(lang, 'send')}
              disabled={!connected || request.busy}
            >
              <SendIcon size={17} />
            </button>
          </form>
          <ErrorNotice text={request.error} />
        </>
      )}
    </section>
  )
}
