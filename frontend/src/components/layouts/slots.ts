import { createContext, useContext, type ReactNode } from 'react'

/**
 * Parts of the top bar that belong to features (Submit Run, the staff inbox). Shared layout code
 * can't import features, so the app's root route fills these in.
 */
export interface LayoutSlots {
  /** The Submit Run dialog, open until `onClose`. */
  submitRun?: (onClose: () => void) => ReactNode
  /** The staff inbox button (shown to staff only). */
  staffInbox?: ReactNode
}

export const LayoutSlotsContext = createContext<LayoutSlots>({})

export const useLayoutSlots = () => useContext(LayoutSlotsContext)
