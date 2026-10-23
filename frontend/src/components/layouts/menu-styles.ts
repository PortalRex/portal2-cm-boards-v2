import { useLocation } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ComponentType } from 'react'
import {
  BarsIcon,
  DiscordIcon,
  DonateIcon,
  GavelIcon,
  GitHubIcon,
  InfoIcon,
  PeopleIcon,
  PersonIcon,
  StarIcon,
  TrophyIcon,
} from '@/components/icons'
import { isHere, type MenuIconName, type MoreEntry } from './nav-model'

type Icon = ComponentType<{ className?: string }>

export const MENU_ICONS: Record<MenuIconName | MoreEntry['icon'], Icon> = {
  bars: BarsIcon,
  person: PersonIcon,
  people: PeopleIcon,
  trophy: TrophyIcon,
  star: StarIcon,
  discord: DiscordIcon,
  github: GitHubIcon,
  donate: DonateIcon,
  gavel: GavelIcon,
  info: InfoIcon,
}

/** A dropdown panel's look (the top bar's menus). */
export const menuPanel = 'rounded-md bg-menu py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.45)]'

/** A menu row; the page you're on gets the blue tag on its left. */
export const menuItem = (active: boolean, highlight = false) =>
  cn(
    'flex items-center gap-3 px-[18px] py-1.5 text-[22px] font-normal whitespace-nowrap hover:bg-control-raised upto1320:text-lg',
    active && 'shadow-[inset_3px_0_0_var(--brand)]',
    highlight && '[&>span]:text-brand-light [&>span]:uppercase',
  )

export function useIsHere(to: string | undefined, also: string[] = []): boolean {
  const { pathname, searchStr } = useLocation()
  return isHere(to, pathname, searchStr, also)
}
