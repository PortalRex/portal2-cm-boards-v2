import type { Team } from '../api/stats'

/**
 * Tied teams as one, each player once: someone who tied the record with two partners shows once,
 * not with each pair.
 */
export function playersOnce(teams: Team[]): Team[] {
  if (teams.length < 2) return teams
  const seen = new Set<string>()
  const players = teams
    .flatMap((t) => t.players)
    .filter((p) => {
      const key = p.profileNumber ?? p.name
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  return [{ players, since: teams[0]!.since }]
}
