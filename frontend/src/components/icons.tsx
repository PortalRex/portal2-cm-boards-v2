import type { SVGProps } from 'react'
import wikiIcon from '@/assets/p2sr-wiki.png'

// The site's icons under the names the legacy site used. Legacy took them from
// @mui/icons-material; these are the closest lucide icons (shadcn's set). The brand marks no set
// ships (lucide 1.x dropped its brand icons) are drawn here.
export {
  History as HistoryIcon,
  Timer as TimerIcon,
  MapPin as PinIcon,
  ChartColumn as BarsIcon,
  Ellipsis as MoreIcon,
  Trophy as TrophyIcon,
  Mountain as PeakIcon,
  ArrowDownToLine as DownloadIcon,
  Flag as FlagIcon,
  Upload as UploadIcon,
  Play as PlayIcon,
  Video as VideocamIcon,
  MessageSquare as CommentIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  SlidersHorizontal as FilterIcon,
  Sun as LightModeIcon,
  Moon as DarkModeIcon,
  Star as StarIcon,
  Globe as GlobeIcon,
  Sparkles as SparkleIcon,
  User as PersonIcon,
  Users as PeopleIcon,
  Menu as MenuIcon,
  X as CloseIcon,
  HandHeart as DonateIcon,
  ArrowLeftRight as CompareIcon,
  ChartLine as StatsIcon,
  Gavel as GavelIcon,
  Info as InfoIcon,
  Inbox as InboxIcon,
  Hourglass as PendingIcon,
  Ban as BannedIcon,
  Repeat as SwapIcon,
  Pencil as EditIcon,
  ShieldUser as ShieldIcon,
  ArrowUp as SortUpIcon,
  ArrowDown as SortDownIcon,
} from 'lucide-react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const svg = ({ size = 24, ...rest }: IconProps) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  // Decorative unless given a name.
  'aria-hidden': rest['aria-label'] ? undefined : true,
  ...rest,
})

// Filled triangles used by the pagination control and the rank change arrow.
export const TriangleLeft = ({ size = 14, ...rest }: IconProps) => (
  <svg {...svg({ size, ...rest })}>
    <path d="M18 3v18L4 12z" />
  </svg>
)
export const TriangleRight = ({ size = 14, ...rest }: IconProps) => (
  <svg {...svg({ size, ...rest })}>
    <path d="M6 3v18l14-9z" />
  </svg>
)
export const TriangleDown = ({ size = 14, ...rest }: IconProps) => (
  <svg {...svg({ size, ...rest })}>
    <path d="M3 6h18l-9 14z" />
  </svg>
)

// A solid trophy for world records: lucide's is drawn for outlines, and filling it fills its
// handles and stem into blobs.
export const TrophyFilledIcon = ({ children, ...props }: IconProps) => (
  <svg {...svg(props)}>
    {children}
    <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2ZM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8Zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1Z" />
  </svg>
)

export const SteamIcon = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="M11.98 1C6.2 1 1.48 5.45 1.02 11.1l5.9 2.44a3.1 3.1 0 0 1 1.76-.54l2.63-3.81v-.05a4.17 4.17 0 1 1 4.17 4.17h-.1l-3.75 2.68v.15a3.13 3.13 0 0 1-6.2.63L1.21 15.1A11 11 0 1 0 11.98 1Zm-4.9 16.7-1.35-.56a2.35 2.35 0 1 0 1.28-3.2l1.4.58a1.73 1.73 0 1 1-1.33 3.18Zm11.1-8.38a2.78 2.78 0 1 0-2.79 2.78 2.78 2.78 0 0 0 2.79-2.78Zm-4.86 0a2.09 2.09 0 1 1 2.08 2.09 2.09 2.09 0 0 1-2.08-2.09Z" />
  </svg>
)

export const DiscordIcon = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
  </svg>
)

export const YouTubeIcon = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6Z" />
  </svg>
)

export const GitHubIcon = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
)

export const TwitchIcon = (props: IconProps) => (
  <svg {...svg(props)}>
    <path d="M4.3 2 3 5.4v13.7h4.6V22h2.6l2.9-2.9h3.7L21 14.9V2Zm15.1 12-2.9 2.9h-4.6l-2.6 2.6v-2.6H5.4V3.6h14Zm-2.9-6v5h-1.6V8Zm-4.3 0v5h-1.6V8Z" />
  </svg>
)

/** The P2SR wiki's own icon (its favicon), next to the wiki link on map pages. */
export const WikiIcon = ({ size = 22 }: { size?: number }) => (
  <img src={wikiIcon} width={size} height={size} alt="" className="inline-block" />
)
