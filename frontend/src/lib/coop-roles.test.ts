import { describe, expect, it } from 'vitest'
import { coopRoles, tintFor } from './coop-roles'

const blue = { profileNumber: '76561198000000001', name: 'Blue' }
const orange = { profileNumber: '76561198000000002', name: 'Orange' }
const run = { players: [blue, orange], coopId: 7, rolesKnown: true }

describe('coopRoles', () => {
  it('keeps the run as it is without an override', () => {
    expect(coopRoles(run)).toEqual({ players: [blue, orange], rolesKnown: true })
    expect(coopRoles({ ...run, rolesKnown: false })).toEqual({ players: [blue, orange], rolesKnown: false })
    // Only an explicit false means unknown (legacy `rolesKnown !== false`).
    expect(coopRoles({ players: [blue] }).rolesKnown).toBe(true)
  })

  it('puts the chosen host first', () => {
    const overrides = new Map([[7, orange.profileNumber]])
    expect(coopRoles(run, overrides)).toEqual({ players: [orange, blue], rolesKnown: true })
    expect(coopRoles({ ...run, rolesKnown: false }, overrides).rolesKnown).toBe(true)
  })

  it('marks the colours unknown when the host was cleared', () => {
    expect(coopRoles(run, new Map([[7, null]]))).toEqual({ players: [blue, orange], rolesKnown: false })
  })

  it('ignores overrides for other runs and single-player runs', () => {
    const overrides = new Map([[8, orange.profileNumber]])
    expect(coopRoles(run, overrides).players).toEqual([blue, orange])
    expect(coopRoles({ players: [blue], coopId: null }, new Map([[7, null]])).rolesKnown).toBe(true)
  })
})

describe('tintFor', () => {
  it('is blue then orange when the roles are known, neutral otherwise', () => {
    expect([tintFor(true, 0), tintFor(true, 1)]).toEqual(['blue', 'orange'])
    expect([tintFor(false, 0), tintFor(false, 1)]).toEqual(['neutral', 'neutral'])
  })
})
