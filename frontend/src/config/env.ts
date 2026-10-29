import { z } from 'zod'

// Build-time settings (VITE_* variables). Each has the same default as the legacy site.
const trimSlash = (url: string) => url.replace(/\/$/, '')

export const envSchema = z.object({
  VITE_API_URL: z.string().min(1).default('/api/v1').transform(trimSlash),
  VITE_AUTORENDER_URL: z.url().default('https://autorender.portal2.sr').transform(trimSlash),
  VITE_AUTORENDER_STORAGE_URL: z
    .url()
    .default('https://portal2.fsn1.your-objectstorage.com')
    .transform(trimSlash),
  VITE_MEL_GAME_ID: z.coerce.number().int().positive().default(2),
  VITE_USE_MOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** The demo viewer is served at /viewer/ (set by vite.config.ts when it's built in). */
  VITE_VIEWER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export type Env = z.infer<typeof envSchema>

/** Parses the raw variables; empty strings count as unset. Throws when one is invalid. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const set = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v != null))
  return envSchema.parse(set)
}

export const env = parseEnv(import.meta.env)
