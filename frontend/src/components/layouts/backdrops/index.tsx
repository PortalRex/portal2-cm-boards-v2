import { Crt } from './crt'

/**
 * Backgrounds a visitor can put behind every page (Settings → Background). Each `Scene` fills its
 * parent; the Settings swatches show it small, as a still `preview`.
 */
export const BACKGROUND_PRESETS = [{ id: 'crt', label: 'CRT', Scene: Crt }] as const

export type BackgroundPreset = (typeof BACKGROUND_PRESETS)[number]
