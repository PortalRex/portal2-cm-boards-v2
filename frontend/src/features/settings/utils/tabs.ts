/** The settings page's tabs, in order (?tab= on its address). */
export const SETTINGS_TABS = ['appearance', 'account'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]
