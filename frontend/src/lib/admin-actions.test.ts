import { describe, expect, it } from 'vitest'
import { ACTIONS, TONES } from './admin-actions'

describe('audit log actions', () => {
  it('labels and colours the actions as legacy does', () => {
    expect(ACTIONS['run.ban']).toBe('Banned run')
    expect(ACTIONS['coop.set_host']).toBe('Set colors')
    expect(TONES['report.new']).toBe('bad')
    expect(TONES['run.verify']).toBe('ok')
    expect(Object.keys(ACTIONS)).toHaveLength(42)
  })

  it('has a label for every coloured action', () => {
    for (const action of Object.keys(TONES)) expect(ACTIONS[action], action).toBeDefined()
  })
})
