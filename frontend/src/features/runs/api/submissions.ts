import { api } from '@/lib/api-client'

// Run submissions (server handlers/submissions.rs), sent as multipart forms with the demo in
// the `demo` field.

/** A player found in a demo. */
export interface DemoPlayer {
  steamId: string
  name: string
}

/** A board map the demo can be for (Mel's Story and Advanced maps share one map file). */
export interface DemoBoardMap {
  steam_id: string
  name: string
  game_id: number
  game_mode: string
  is_coop: boolean
  default_cat_id: number | null
}

/** What a demo contains, read by the server without saving anything. */
export interface DemoPreview {
  mapName: string | null
  clientName: string | null
  /** Centiseconds from the end-of-run scoreboard; null when the demo has no finished run. */
  timeScore: number | null
  portalScore: number | null
  players: DemoPlayer[]
  maps: DemoBoardMap[]
}

/** The recorded run. */
export interface SubmitResult {
  changelog_id: number
  map_id: string
  map_name: string
  score: number
  partner: string | null
  /** Every board the run counts on (linked leaderboards and seasons). */
  boards: string[]
  /** A new co-op run waits for the partner's demo. */
  waiting_for_partner: boolean
}

/** `youtube`, `comment`, `mel_mode` and the admin-only `map_id`, `time`, `profile_number`, `partner`. */
export type SubmitFields = Record<string, string>

const demoForm = (file: File | null) => {
  const form = new FormData()
  if (file) form.append('demo', file)
  return form
}

export const previewDemo = (file: File) =>
  api.post<DemoPreview>('/submissions/preview', { body: demoForm(file) })

/** Submits a run; blank fields are left out, as legacy did. */
export function submitRun(file: File | null, fields: SubmitFields) {
  const form = demoForm(file)
  for (const [key, value] of Object.entries(fields)) {
    if (value.trim() !== '') form.append(key, value.trim())
  }
  return api.post<SubmitResult>('/submissions', { body: form })
}

/**
 * Adds the demo for a pending run; the server checks it matches and verifies the run. Resolves to
 * whether the run is verified now (a new co-op run waits for both players' demos).
 */
export const addRunDemo = async (changelogId: number, file: File) =>
  (await api.post<{ verified?: boolean } | null>(`/runs/${changelogId}/demo`, { body: demoForm(file) }))
    ?.verified ?? true
