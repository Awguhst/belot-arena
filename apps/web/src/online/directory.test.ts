import { describe, expect, it } from 'vitest'
import type { RoomListing } from '../../../../packages/multiplayer/src/protocol'
import { clearFilters, visibleRooms } from './Directory'

const sample: RoomListing = {
  id: 'one',
  title: 'София',
  hostName: 'Ivan',
  humans: 1,
  humanCapacity: 2,
  bots: 2,
  openSeats: 1,
  difficulty: 'beginner',
  target: 51,
  locked: true,
  status: 'waiting',
  createdAt: 1,
}
const rooms: RoomListing[] = [
  sample,
  {
    ...sample,
    id: 'two',
    title: 'After dinner',
    hostName: 'Mira',
    target: 151,
    humanCapacity: 4,
    bots: 0,
    humans: 4,
    openSeats: 0,
    status: 'playing',
    locked: false,
    difficulty: 'advanced',
    createdAt: 3,
  },
  {
    ...sample,
    id: 'three',
    title: 'Zebra',
    hostName: 'Ivan',
    target: 101,
    humanCapacity: 4,
    openSeats: 3,
    bots: 0,
    locked: false,
    createdAt: 2,
  },
  {
    ...sample,
    id: 'four',
    title: 'Evening',
    hostName: 'Mira',
    humans: 2,
    openSeats: 0,
    status: 'ready',
    createdAt: 4,
  },
]
describe('public room browser', () => {
  it('orders joinable tables before newer full and playing tables and leaves the live snapshot intact', () => {
    expect(visibleRooms(rooms, '', clearFilters, 'recommended', 'en').map((r) => r.id)).toEqual([
      'three',
      'one',
      'four',
      'two',
    ])
    expect(rooms.map((r) => r.id)).toEqual(['one', 'two', 'three', 'four'])
  })
  it('searches titles and nicknames in both languages and combines all filters', () => {
    expect(visibleRooms(rooms, ' СОФ ', clearFilters, 'newest', 'bg')).toEqual([sample])
    expect(
      visibleRooms(
        rooms,
        'IVAN',
        {
          ...clearFilters,
          unlocked: true,
          available: true,
          beginner: true,
          bots: 'without',
          status: 'waiting',
          target: 101,
        },
        'newest',
        'en',
      ).map((r) => r.id),
    ).toEqual(['three'])
    expect(
      visibleRooms(rooms, '', { ...clearFilters, bots: 'with', status: 'waiting' }, 'newest', 'en').map(
        (r) => r.id,
      ),
    ).toEqual(['four', 'one'])
    expect(
      visibleRooms(rooms, '', { ...clearFilters, status: 'playing' }, 'newest', 'en').map((r) => r.id),
    ).toEqual(['two'])
  })
  it('sorts by capacity, occupancy, title or match length independently of room status', () => {
    expect(visibleRooms(rooms, '', clearFilters, 'playersSort', 'en')[0].id).toBe('two')
    expect(visibleRooms(rooms, '', clearFilters, 'seatsSort', 'en')[0].id).toBe('three')
    expect(visibleRooms(rooms, '', clearFilters, 'titleSort', 'en')[0].id).toBe('two')
    expect(visibleRooms(rooms, '', clearFilters, 'lengthSort', 'en').map((r) => r.target)).toEqual([
      51, 51, 101, 151,
    ])
  })
})
