import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Bot,
  ChevronDown,
  Club,
  DoorOpen,
  Flag,
  Gamepad2,
  Heart,
  Layers,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Spade,
  Diamond,
  Users,
  X,
} from 'lucide-react'
import type { Guest, Presence, RoomListing } from '../../../../packages/multiplayer/src/protocol'
import { t } from '../i18n'
import type { Lang } from '../store'
import { ow } from './words'
import {
  ErrorNotice,
  Monogram,
  NicknameEntry,
  NicknameDialog,
  PasswordDialog,
  Status,
  useRequest,
  type Send,
} from './ui'
import { RoomForm } from './RoomForm'
import './online.css'

export interface DirectoryFilters {
  available: boolean
  unlocked: boolean
  beginner: boolean
  bots: 'any' | 'with' | 'without'
  target: number
  status: 'any' | 'waiting' | 'playing' | 'completed'
}
export const clearFilters: DirectoryFilters = {
  available: false,
  unlocked: false,
  beginner: false,
  bots: 'any',
  target: 0,
  status: 'any',
}
export type RoomSort =
  'recommended' | 'newest' | 'seatsSort' | 'playersSort' | 'titleSort' | 'lengthSort'
export const canJoin = (room: RoomListing) =>
  (room.status === 'waiting' || room.status === 'ready') && room.openSeats > 0
export function visibleRooms(
  rooms: RoomListing[],
  query: string,
  filters: DirectoryFilters,
  sort: RoomSort,
  lang: Lang,
) {
  const q = query.trim().toLocaleLowerCase(lang)
  const filtered = rooms.filter(
    (r) =>
      (!q ||
        r.title.toLocaleLowerCase(lang).includes(q) ||
        r.hostName.toLocaleLowerCase(lang).includes(q)) &&
      (!filters.available || canJoin(r)) &&
      (!filters.unlocked || !r.locked) &&
      (!filters.beginner || r.difficulty === 'beginner') &&
      (filters.bots === 'any' || (filters.bots === 'with' ? r.bots > 0 : r.bots === 0)) &&
      (!filters.target || r.target === filters.target) &&
      (filters.status === 'any' ||
        r.status === filters.status ||
        (filters.status === 'waiting' && r.status === 'ready')),
  )
  const titleOrder = new Intl.Collator(lang, { sensitivity: 'base', numeric: true })
  return filtered.sort((a, b) => {
    let diff = 0
    if (sort === 'recommended') diff = Number(canJoin(b)) - Number(canJoin(a))
    if (sort === 'seatsSort') diff = b.openSeats - a.openSeats
    if (sort === 'playersSort') diff = b.humans - a.humans
    if (sort === 'titleSort') diff = titleOrder.compare(a.title, b.title)
    if (sort === 'lengthSort') diff = a.target - b.target
    return diff || b.createdAt - a.createdAt || a.id.localeCompare(b.id)
  })
}
interface Props {
  lang: Lang
  guest: Guest
  rooms: RoomListing[]
  presence: Presence | null
  connected: boolean
  retrying: boolean
  restoringName: boolean
  view: ReturnType<typeof useDirectoryView>
  send: Send
  offline: () => void
}
export function useDirectoryView() {
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState<RoomSort>('recommended'),
    [filters, setFilters] = useState(clearFilters),
    [showFilters, toggleFilters] = useState(false)
  return { query, setQuery, sort, setSort, filters, setFilters, showFilters, toggleFilters }
}
export function Directory({
  lang,
  guest,
  rooms,
  presence,
  connected,
  retrying,
  restoringName,
  view,
  send,
  offline,
}: Props) {
  const { query, setQuery, sort, setSort, filters, setFilters, showFilters, toggleFilters } = view
  const [host, setHost] = useState(false),
    [editName, setEditName] = useState(false),
    [joinRoom, setJoinRoom] = useState<RoomListing | null>(null)
  const request = useRequest(lang)
  const results = useMemo(
    () => visibleRooms(rooms, query, filters, sort, lang),
    [rooms, query, filters, sort, lang],
  )
  const activeFilters = (Object.keys(clearFilters) as (keyof DirectoryFilters)[]).filter(
    (k) => filters[k] !== clearFilters[k],
  ).length
  const usable = connected && !!presence && !!guest.name
  function filter<K extends keyof DirectoryFilters>(key: K, value: DirectoryFilters[K]) {
    setFilters((s) => ({ ...s, [key]: value }))
  }
  function join(room: RoomListing) {
    request.setError('')
    if (room.locked) setJoinRoom(room)
    else void request.run(() => send({ type: 'room:join', roomId: room.id }))
  }
  function clear() {
    setQuery('')
    setFilters(clearFilters)
  }
  return (
    <section className="net-page" aria-labelledby="public-rooms-heading">
      <div className="net-main">
        <header className="net-banner">
          <div className="net-page-heading">
            <h1 id="public-rooms-heading">{ow(lang, 'publicRooms')}</h1>
            <button
              className="btn net-host"
              disabled={!usable}
              onClick={() => {
                request.setError('')
                setHost(true)
              }}
            >
              <Plus size={18} />
              {ow(lang, 'hostRoom')}
            </button>
          </div>
          <div className="net-banner-foot">
            <dl className="net-presence" aria-live="off">
              {(
                [
                  { label: 'connected', Icon: Users, value: presence?.connected },
                  {
                    label: 'available',
                    Icon: DoorOpen,
                    value: presence ? rooms.filter(canJoin).length : undefined,
                  },
                  { label: 'active', Icon: Gamepad2, value: presence?.matches },
                ] as const
              ).map(({ label, Icon, value }) => (
                <div key={label}>
                  <Icon size={17} />
                  <dd>{connected && value !== undefined ? value : '—'}</dd>
                  <dt>{ow(lang, label)}</dt>
                </div>
              ))}
            </dl>
            <div className="net-account-actions">
              <button className="net-offline" onClick={offline}>
                <ArrowLeft size={15} />
                {ow(lang, 'offline')}
              </button>
              {guest.name && (
                <button
                  className="net-identity"
                  disabled={!connected}
                  onClick={() => setEditName(true)}
                  aria-label={ow(lang, 'editName')}
                  title={ow(lang, 'editName')}
                >
                  <Monogram name={guest.name} />
                  <strong>{guest.name}</strong>
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </div>
        </header>
        {connected && !guest.name && !restoringName && <NicknameEntry lang={lang} send={send} />}
        <section aria-label={ow(lang, 'publicList')} className="net-browser">
          <div className="net-tools">
            <label className="net-search">
              <Search size={17} />
              <input
                type="search"
                aria-label={ow(lang, 'search')}
                placeholder={ow(lang, 'search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className={'net-filter-button net-secondary' + (activeFilters ? ' net-selected' : '')}
              aria-expanded={showFilters}
              aria-controls="net-filters"
              onClick={() => toggleFilters(!showFilters)}
            >
              <SlidersHorizontal size={15} />
              {ow(lang, 'filters')}
              {activeFilters > 0 && <b>{activeFilters}</b>}
              <ChevronDown size={13} />
            </button>
            <label className="net-sort">
              <ArrowUpDown size={15} />
              <select
                value={sort}
                aria-label={ow(lang, 'sort')}
                onChange={(e) => setSort(e.target.value as RoomSort)}
              >
                <option value="recommended">
                  {lang === 'bg' ? 'Свободните първо' : 'Joinable first'}
                </option>
                {(['newest', 'seatsSort', 'playersSort', 'titleSort', 'lengthSort'] as const).map(
                  (s) => (
                    <option key={s} value={s}>
                      {ow(lang, s)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          {showFilters && (
            <div id="net-filters" className="net-filters">
              <div className="net-filter-checks">
                {(
                  [
                    ['available', 'availableOnly'],
                    ['unlocked', 'unlockedOnly'],
                    ['beginner', 'beginnerOnly'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={filters[key]}
                      onChange={(e) => filter(key, e.target.checked)}
                    />
                    {ow(lang, label)}
                  </label>
                ))}
              </div>
              <div className="net-filter-selects">
                <label>
                  {ow(lang, 'players')}
                  <select
                    aria-label={ow(lang, 'players')}
                    value={filters.bots}
                    onChange={(e) => filter('bots', e.target.value as DirectoryFilters['bots'])}
                  >
                    <option value="any">{ow(lang, 'any')}</option>
                    <option value="with">{ow(lang, 'withBots')}</option>
                    <option value="without">{ow(lang, 'onlyPeople')}</option>
                  </select>
                </label>
                <label>
                  {ow(lang, 'pointTarget')}
                  <select
                    aria-label={ow(lang, 'pointTarget')}
                    value={filters.target}
                    onChange={(e) => filter('target', +e.target.value)}
                  >
                    <option value={0}>{ow(lang, 'any')}</option>
                    {[51, 101, 151].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {ow(lang, 'status')}
                  <select
                    aria-label={ow(lang, 'status')}
                    value={filters.status}
                    onChange={(e) => filter('status', e.target.value as DirectoryFilters['status'])}
                  >
                    {(['any', 'waiting', 'playing', 'completed'] as const).map((s) => (
                      <option key={s} value={s}>
                        {ow(lang, s)}
                      </option>
                    ))}
                  </select>
                </label>
                {activeFilters > 0 && (
                  <button type="button" className="text-btn" onClick={() => setFilters(clearFilters)}>
                    <X size={14} />
                    {ow(lang, 'clear')}
                  </button>
                )}
              </div>
            </div>
          )}
          <ErrorNotice text={request.error} />
          <table className="net-room-list">
            <thead>
              <tr>
                <th>{ow(lang, 'room')}</th>
                <th>{ow(lang, 'humans')}</th>
                <th>{ow(lang, 'bots')}</th>
                <th>{ow(lang, 'points')}</th>
                <th>{ow(lang, 'status')}</th>
                <th aria-label={ow(lang, 'join')} />
              </tr>
            </thead>
            <tbody>
              {results.map((room) => {
                const Suit = [Spade, Heart, Club, Diamond][
                  Array.from(room.id).reduce((s, c) => s + c.charCodeAt(0), 0) % 4
                ]
                return (
                  <tr key={room.id} data-room-id={room.id}>
                    <td className="net-title-cell">
                      <div className="net-room-title">
                        <span className="net-room-mark">
                          <Suit size={21} />
                        </span>
                        <div>
                          <strong title={room.title}>
                            <span className="net-room-label">{room.title}</span>
                            {room.locked && (
                              <LockKeyhole
                                className="net-lock"
                                size={14}
                                role="img"
                                aria-label={ow(lang, 'locked')}
                              />
                            )}
                          </strong>
                          <small title={room.hostName}>
                            {ow(lang, 'host')} · {room.hostName}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="net-humans-cell">
                      <span className="net-table-value">
                        <Users size={15} />
                        {room.humans}
                        <span>/ {room.humanCapacity}</span>
                      </span>
                    </td>
                    <td className="net-bots-cell">
                      <span className="net-table-value">
                        <Bot size={15} />
                        {room.bots}
                        <small>{room.bots ? t(lang, room.difficulty) : ow(lang, 'noBots')}</small>
                      </span>
                    </td>
                    <td className="net-points-cell">
                      <span className="net-table-value">
                        <Flag size={14} />
                        {room.target}
                      </span>
                    </td>
                    <td className="net-status-cell">
                      <Status lang={lang} status={room.status} />
                    </td>
                    <td className="net-join-cell">
                      <button
                        disabled={!usable || !canJoin(room) || request.busy}
                        className="net-join"
                        onClick={() => join(room)}
                      >
                        {ow(
                          lang,
                          canJoin(room)
                            ? 'join'
                            : room.status === 'playing'
                              ? 'playing'
                              : room.status === 'completed'
                                ? 'completed'
                                : 'full',
                        )}
                        {canJoin(room) && <ArrowRight size={14} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(!connected || !presence) && (
            <div className="net-empty" role="status">
              <Layers />
              {ow(lang, retrying ? 'retrying' : 'connecting')}
            </div>
          )}
          {connected && presence && !results.length && (
            <div className="net-empty">
              <span className="net-empty-mark">
                <Spade size={24} />
              </span>
              <h2>{ow(lang, rooms.length ? 'noMatches' : 'noRooms')}</h2>
              <p>{ow(lang, rooms.length ? 'noResultsInfo' : 'openFirst')}</p>
              {rooms.length > 0 && (
                <button className="text-btn" onClick={clear}>
                  <X size={14} />
                  {ow(lang, 'clear')}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
      {editName && guest.name && (
        <NicknameDialog
          lang={lang}
          guest={guest}
          send={send}
          connected={connected}
          close={() => setEditName(false)}
        />
      )}
      {host && (
        <RoomForm
          lang={lang}
          name={guest.name}
          send={send}
          connected={connected}
          close={() => setHost(false)}
        />
      )}
      {joinRoom && (
        <PasswordDialog
          lang={lang}
          title={joinRoom.title}
          locked
          connected={connected}
          close={() => setJoinRoom(null)}
          submit={async (password) => {
            try {
              await send({ type: 'room:join', roomId: joinRoom.id, password })
            } catch (e) {
              if (e instanceof Error && e.message === 'wrong_password') throw e
              request.setError(e)
              setJoinRoom(null)
            }
          }}
        />
      )}
    </section>
  )
}
