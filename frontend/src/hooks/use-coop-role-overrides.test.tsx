import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { coopRoles } from '@/lib/coop-roles'
import { createTestQueryClient } from '@/testing/test-utils'
import { setCoopRoleOverride, useCoopRoleOverrides } from './use-coop-role-overrides'

describe('useCoopRoleOverrides', () => {
  it('starts empty and updates every reader when staff set a host', () => {
    const qc = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const a = renderHook(() => useCoopRoleOverrides(), { wrapper })
    const b = renderHook(() => useCoopRoleOverrides(), { wrapper })
    expect(a.result.current.size).toBe(0)
    act(() => setCoopRoleOverride(qc, 7, '2'))
    expect(b.result.current.get(7)).toBe('2')
    const run = { coopId: 7, rolesKnown: false, players: [{ profileNumber: '1' }, { profileNumber: '2' }] }
    expect(coopRoles(run, a.result.current)).toEqual({
      players: [{ profileNumber: '2' }, { profileNumber: '1' }],
      rolesKnown: true,
    })
    act(() => setCoopRoleOverride(qc, 7, null))
    expect(coopRoles(run, a.result.current).rolesKnown).toBe(false)
  })
})
