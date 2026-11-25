import { createContext, useContext, type ReactNode } from 'react'
import { teamOf, type Team, type Seat } from '@belot/game-engine'
import { playerName } from './names'
import { useClub, type Lang, type Preferences } from '../store'

export interface TableRoom {
  title: string
  players: Record<Seat, { name: string; human: boolean; connected: boolean; roomSeat: Seat }>
  hints: boolean
  education: boolean
  blocked: boolean
  headerStatus: ReactNode
  returnToRoom: () => void
  canReturnAtHandEnd: boolean
}
export const TableRoomContext = createContext<TableRoom | null>(null)
export const useTableRoom = () => useContext(TableRoomContext)
export function useTablePrefSetter() {
  const room = useTableRoom()
  const setPref = useClub((state) => state.setPref)
  return <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPref(key, value, room ? 'online' : 'offline')
}
export function usePlayerName(lang: Lang) {
  const room = useTableRoom()
  return (seat: Seat) => room?.players[seat].name || playerName(lang, seat)
}
export const roomReturnText = (lang: Lang) => (lang === 'bg' ? 'Към стаята' : 'Return to room')
export function roomTeamNumber(team: Team, room: TableRoom | null) {
  if (!room) return undefined
  return teamOf(room.players.south.roomSeat) === team ? 1 : 2
}
