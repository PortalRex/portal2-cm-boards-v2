import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ComponentType, CSSProperties, ReactNode, SVGProps } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar, Flag } from '@/components/avatar'
import { roundButton } from '@/components/round-button'
import { EditIcon, SteamIcon, SwapIcon, TwitchIcon, YouTubeIcon } from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { countryName } from '@/lib/data/countries'
import { roleIcon, type PointRole } from '@/lib/data/roles'
import { youtubeChannelUrl } from '@/lib/youtube'
import type { ProfileBadge, ProfilePlayer } from '../types'

export type ProfileRole = (PointRole & { fromPeak?: boolean }) | null

const BADGE_TONES: Record<ProfileBadge['tone'] | 'frozen', string> = {
  teal: 'bg-[#3f7f7a]',
  red: 'bg-[#a14a4a]',
  staff: 'bg-[#5b4ec4]',
  frozen: 'bg-[#3b6f9a]',
}

function Badge({
  tone,
  title,
  children,
}: {
  tone: keyof typeof BADGE_TONES
  title?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center rounded-[4px] px-3 text-[15px] font-medium',
        BADGE_TONES[tone],
      )}
      title={title}
    >
      {children}
    </span>
  )
}

interface SiteLink {
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  label: string
  className: string
  size: number
}

/** Steam, Twitch and YouTube, at the header's bottom right. */
function siteLinks(player: ProfilePlayer): SiteLink[] {
  const links: SiteLink[] = [
    {
      href: `https://steamcommunity.com/profiles/${player.steam}`,
      icon: SteamIcon,
      label: 'Steam',
      className: '',
      size: 32,
    },
  ]
  if (player.twitch) {
    links.push({
      href: `https://twitch.tv/${player.twitch}`,
      icon: TwitchIcon,
      label: 'Twitch',
      className: 'bg-[#6441a5]',
      size: 32,
    })
  }
  const youtube = youtubeChannelUrl(player.youtube)
  if (youtube) {
    links.push({
      href: youtube,
      icon: YouTubeIcon,
      label: 'YouTube',
      className: 'bg-[#d93a3a]',
      size: 30,
    })
  }
  return links
}

/** Compare this player with yourself (signed in), or pick someone to compare with. */
function CompareLink({ player }: { player: ProfilePlayer }) {
  const user = useCurrentUser()
  const me = user && !user.sample && user.profileNumber !== player.profileNumber ? user.profileNumber : null
  return (
    <AppLink
      href={me ? `/compare?a=${me}&b=${player.profileNumber}` : `/compare?a=${player.profileNumber}`}
      className={roundButton}
      title={me ? 'Compare your times with this player' : 'Compare this player with someone'}
      aria-label="Compare"
    >
      <SwapIcon />
    </AppLink>
  )
}

/** Your own profile: name, picture and country are changed in Settings. */
function EditLink({ player }: { player: ProfilePlayer }) {
  const user = useCurrentUser()
  if (!user || user.sample || user.profileNumber !== player.profileNumber) return null
  return (
    <Link
      to="/more/settings"
      className={roundButton}
      title="Change your name, picture and country in Settings"
      aria-label="Edit profile"
    >
      <EditIcon />
    </Link>
  )
}

/**
 * The header card: a grey band across the top with the icon buttons at its right end, the picture
 * overlapping it, and the name, badges and country along the bottom with the links bottom-right.
 * On phones: name beside the picture, buttons and links under them. `actions` are buttons of
 * other features (follow, staff tools), shown before compare and edit.
 */
export function ProfileHeader({
  player,
  role,
  actions,
  after,
}: {
  player: ProfilePlayer
  role: ProfileRole
  actions?: ReactNode
  /** Buttons after compare and edit (the staff tools). */
  after?: ReactNode
}) {
  return (
    <section className="glass relative grid grid-cols-[auto_minmax(0,1fr)] gap-7 rounded-lg bg-[linear-gradient(var(--panel-head)_0_48px,var(--panel)_48px)] py-5 pr-7 pl-8 upto800:grid-cols-[auto_minmax(0,1fr)_auto] upto800:gap-4 upto800:bg-panel upto800:p-5 upto800:[grid-template-areas:'avatar_identity_identity'_'actions_actions_links']">
      <Avatar
        src={player.avatar}
        name={player.name}
        size={138}
        className="rounded-[20px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] upto800:[grid-area:avatar] upto800:size-24!"
      />
      <div className="flex min-w-0 flex-col justify-end upto800:contents">
        <div className="flex items-end justify-between gap-4 upto800:contents">
          <div className="mb-1 min-w-0 upto800:mb-0 upto800:self-center upto800:[grid-area:identity]">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 upto800:gap-x-3 upto800:gap-y-1.5">
              <h1
                className={cn(
                  'm-0 max-w-full min-w-0 text-[40px] leading-[1.1] font-bold [overflow-wrap:break-word] upto800:text-[clamp(22px,7vw,30px)] upto800:break-words',
                  role && 'text-(--role) light:text-[color-mix(in_srgb,var(--role)_62%,#000)]',
                )}
                style={role ? ({ '--role': role.color } as CSSProperties) : undefined}
                title={
                  role
                    ? role.fromPeak
                      ? `${role.name} (reached at peak points, kept for good)`
                      : `${role.name} (from points)`
                    : undefined
                }
              >
                {player.name}
                {role && (
                  <img
                    className="ml-[0.25em] inline-block size-[0.85em] object-contain align-[-0.08em]"
                    src={roleIcon(role) ?? undefined}
                    alt={role.name}
                  />
                )}
              </h1>
              {(player.badges.length > 0 || player.banned || player.frozen) && (
                <div className="flex flex-wrap items-center gap-2">
                  {player.badges.map((b) => (
                    <Badge key={b.label} tone={b.tone}>
                      {b.label}
                    </Badge>
                  ))}
                  {player.banned && (
                    <Badge tone="red" title="Banned: this player's runs are hidden from the boards">
                      Banned
                    </Badge>
                  )}
                  {player.frozen && (
                    <Badge
                      tone="frozen"
                      title={
                        player.frozenReason
                          ? `Frozen: ${player.frozenReason}`
                          : "Frozen: existing times stay, new ones aren't accepted"
                      }
                    >
                      Frozen
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {player.country && (
              <div className="mt-2.5 flex items-center gap-2.5 text-lg">
                <Flag code={player.country} height={22} />
                {countryName(player.country)}
              </div>
            )}
          </div>
          <div className="flex flex-none gap-3.5 upto800:self-center upto800:[grid-area:links]">
            {siteLinks(player).map(({ href, icon: Icon, label, className, size }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn('inline-flex size-10 items-center justify-center rounded-md', className)}
                aria-label={label}
                title={label}
              >
                <Icon size={size} />
              </a>
            ))}
          </div>
        </div>
        {/* In the band, kept out of the layout's height. */}
        <div className="absolute top-0 right-7 flex h-12 items-center gap-2 upto800:contents">
          <div className="flex items-center gap-2 upto800:[grid-area:actions]">
            {actions}
            <CompareLink player={player} />
            <EditLink player={player} />
            {after}
          </div>
        </div>
      </div>
    </section>
  )
}
