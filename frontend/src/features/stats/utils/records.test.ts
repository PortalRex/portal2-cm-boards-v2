import { describe, expect, it } from 'vitest'
import { orderRecords } from './records'

// In map order: Doors stood 1163 days, Buttons 919, Lasers 1466, Rat Maze 919.
const rows = [
  { map: 'Doors', days: 1163 },
  { map: 'Buttons', days: 919 },
  { map: 'Lasers', days: 1466 },
  { map: 'Rat Maze', days: 919 },
]
const maps = (order: Parameters<typeof orderRecords>[1]) => orderRecords(rows, order).map((r) => r.map)

describe('orderRecords', () => {
  it('keeps map order, or sorts by how long each record has stood, ties in map order', () => {
    expect(maps('map')).toEqual(['Doors', 'Buttons', 'Lasers', 'Rat Maze'])
    expect(maps('longest')).toEqual(['Lasers', 'Doors', 'Buttons', 'Rat Maze'])
    expect(maps('shortest')).toEqual(['Buttons', 'Rat Maze', 'Doors', 'Lasers'])
  })
})
