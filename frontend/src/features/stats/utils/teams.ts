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

/**
 * The team (or teams, at the same moment) that got the time first, leaving out those who tied it
 * later. Teams without a date only count when none has one.
 */
export function firstTeams(teams: Team[]): Team[] {
  const dated = teams.filter((t) => t.since != null)
  if (!dated.length) return teams
  const first = dated.reduce((a, t) => (t.since! < a ? t.since! : a), dated[0]!.since!)
  return dated.filter((t) => t.since === first)
}
