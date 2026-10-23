import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

// The games editor's calls (server handlers/catalog.rs). Each change is logged in the audit log.

const map = (steamId: string) => `/admin/maps/${encodeURIComponent(steamId)}`
const imageForm = (file: File) => {
  const form = new FormData()
  form.append('image', file)
  return form
}

export interface NewGame {
  name: string
  slug: string
  /** Seasons only. */
  base_game_id?: number
  starts_at?: string | null
  ends_at?: string | null
  link_to_base?: boolean
}

export const createGame = (game: NewGame) => api.post<{ id: number }>('/admin/games', { body: game })
/** Any of name, slug, short_name, starts_at, ends_at, hidden, or `mode_name: { mode, name }` ("" removes it). */
export const updateGame = (id: number, changes: Record<string, unknown>) =>
  api.put(`/admin/games/${id}`, { body: changes })
export const deleteGame = (id: number) => api.delete(`/admin/games/${id}`)
/** The chapter order and which maps each holds, in order. */
export const saveLayout = (id: number, chapters: { id: number; maps: string[] }[]) =>
  api.put(`/admin/games/${id}/layout`, { body: { chapters } })
export const linkGames = (id: number, other: number) =>
  api.post(`/admin/games/${id}/links`, { body: { game_id: other } })
export const unlinkGames = (id: number, other: number) => api.delete(`/admin/games/${id}/links/${other}`)
/** A game's header logo or page background (PNG, JPEG or WebP, up to 5 MB). */
export const setGameImage = (id: number, kind: GameImageKind, file: File) =>
  api.post(`/admin/games/${id}/images/${kind}`, { body: imageForm(file) })
export const removeGameImage = (id: number, kind: GameImageKind) =>
  api.delete(`/admin/games/${id}/images/${kind}`)
export type GameImageKind = 'logo' | 'background'

/** A game's Discord webhook for WR announcements, its secret part hidden (admins only). */
export interface GameWebhook {
  set: boolean
  /** e.g. "https://discord.com/api/webhooks/123/…abcd"; null when there's none. */
  url: string | null
}
export const gameWebhookQueryOptions = (id: number) =>
  queryOptions({
    queryKey: queryKeys.admin.gameWebhook(id),
    queryFn: ({ signal }) => api.get<GameWebhook>(`/admin/games/${id}/webhook`, { signal }),
  })
/** Sets the webhook (a Discord webhook address), or removes it with null. */
export const setGameWebhook = (id: number, url: string | null) =>
  api.put<GameWebhook>(`/admin/games/${id}/webhook`, { body: { url } })
export const testGameWebhook = (id: number) => api.post(`/admin/games/${id}/webhook/test`)

export const createChapter = (
  gameId: number,
  chapter: { name: string; game_mode: string; is_multiplayer: boolean },
) => api.post(`/admin/games/${gameId}/chapters`, { body: chapter })
export const updateChapter = (id: number, changes: { name?: string; game_mode?: string }) =>
  api.put(`/admin/chapters/${id}`, { body: changes })
export const deleteChapter = (id: number) => api.delete(`/admin/chapters/${id}`)

export const createMap = (
  chapterId: number,
  m: { name: string; steam_id: string | null; bsp_name: string | null },
) => api.post(`/admin/chapters/${chapterId}/maps`, { body: m })
export const updateMap = (
  steamId: string,
  changes: { name?: string; bsp_name?: string | null; default_cat_id?: number },
) => api.put(map(steamId), { body: changes })
export const deleteMap = (steamId: string) => api.delete(map(steamId))
/** A map's own image, replacing the built-in one. */
export const setMapImage = (steamId: string, file: File) =>
  api.post(`${map(steamId)}/image`, { body: imageForm(file) })
export const removeMapImage = (steamId: string) => api.delete(`${map(steamId)}/image`)
export const linkMap = (steamId: string, other: string) =>
  api.post(`${map(steamId)}/links`, { body: { map: other } })
export const unlinkMap = (steamId: string, other: string) =>
  api.delete(`${map(steamId)}/links/${encodeURIComponent(other)}`)

export const createCategory = (steamId: string, name: string) =>
  api.post(`${map(steamId)}/categories`, { body: { name } })
export const updateCategory = (id: number, name: string) =>
  api.put(`/admin/categories/${id}`, { body: { name } })
export const deleteCategory = (id: number) => api.delete(`/admin/categories/${id}`)
