// Icon set used across the boards. Most come from @mui/icons-material; the
// brand marks MUI doesn't ship are drawn inline.
export { default as HistoryIcon } from "@mui/icons-material/History";
export { default as TimerIcon } from "@mui/icons-material/TimerOutlined";
export { default as PinIcon } from "@mui/icons-material/LocationOnOutlined";
export { default as BarsIcon } from "@mui/icons-material/BarChartRounded";
export { default as MoreIcon } from "@mui/icons-material/MoreHoriz";
export { default as TrophyIcon } from "@mui/icons-material/EmojiEvents";
export { default as DownloadIcon } from "@mui/icons-material/Download";
export { default as FlagIcon } from "@mui/icons-material/OutlinedFlag";
export { default as UploadIcon } from "@mui/icons-material/FileUploadOutlined";
export { default as YouTubeIcon } from "@mui/icons-material/YouTube";
export { default as PlayIcon } from "@mui/icons-material/PlayArrow";
export { default as VideocamIcon } from "@mui/icons-material/Videocam";
export { default as CommentIcon } from "@mui/icons-material/ChatBubble";
export { default as ChevronDownIcon } from "@mui/icons-material/KeyboardArrowDown";
export { default as ChevronRightIcon } from "@mui/icons-material/ChevronRight";
export { default as CaretDownIcon } from "@mui/icons-material/ArrowDropDown";
export { default as SearchIcon } from "@mui/icons-material/Search";
export { default as FilterIcon } from "@mui/icons-material/Tune";
export { default as LightModeIcon } from "@mui/icons-material/LightModeOutlined";
export { default as DarkModeIcon } from "@mui/icons-material/DarkModeOutlined";
export { default as StarIcon } from "@mui/icons-material/Star";
export { default as ThumbUpIcon } from "@mui/icons-material/ThumbUpAlt";
export { default as ThumbUpOutlineIcon } from "@mui/icons-material/ThumbUpOffAlt";
export { default as ThumbDownIcon } from "@mui/icons-material/ThumbDownAlt";
export { default as ThumbDownOutlineIcon } from "@mui/icons-material/ThumbDownOffAlt";
export { default as StarOutlineIcon } from "@mui/icons-material/StarBorder";
export { default as GlobeIcon } from "@mui/icons-material/Public";
export { default as SparkleIcon } from "@mui/icons-material/AutoAwesome";
export { default as PersonIcon } from "@mui/icons-material/Person";
export { default as PeopleIcon } from "@mui/icons-material/People";
export { default as MenuIcon } from "@mui/icons-material/Menu";
export { default as CloseIcon } from "@mui/icons-material/Close";
export { default as GitHubIcon } from "@mui/icons-material/GitHub";
export { default as DonateIcon } from "@mui/icons-material/VolunteerActivism";
export { default as CompareIcon } from "@mui/icons-material/CompareArrows";
export { default as GavelIcon } from "@mui/icons-material/Gavel";
export { default as InfoIcon } from "@mui/icons-material/InfoOutlined";

const svgProps = (size) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true });

// Filled triangles used by the pagination control and the rank change arrow.
export const TriangleLeft = ({ size = 14 }) => (
  <svg {...svgProps(size)}><path d="M18 3v18L4 12z" /></svg>
);
export const TriangleRight = ({ size = 14 }) => (
  <svg {...svgProps(size)}><path d="M6 3v18l14-9z" /></svg>
);
export const TriangleDown = ({ size = 14 }) => (
  <svg {...svgProps(size)}><path d="M3 6h18l-9 14z" /></svg>
);

export const SteamIcon = ({ size = 24 }) => (
  <svg {...svgProps(size)}>
    <path d="M11.98 1C6.2 1 1.48 5.45 1.02 11.1l5.9 2.44a3.1 3.1 0 0 1 1.76-.54l2.63-3.81v-.05a4.17 4.17 0 1 1 4.17 4.17h-.1l-3.75 2.68v.15a3.13 3.13 0 0 1-6.2.63L1.21 15.1A11 11 0 1 0 11.98 1Zm-4.9 16.7-1.35-.56a2.35 2.35 0 1 0 1.28-3.2l1.4.58a1.73 1.73 0 1 1-1.33 3.18Zm11.1-8.38a2.78 2.78 0 1 0-2.79 2.78 2.78 2.78 0 0 0 2.79-2.78Zm-4.86 0a2.09 2.09 0 1 1 2.08 2.09 2.09 2.09 0 0 1-2.08-2.09Z" />
  </svg>
);

export const DiscordIcon = ({ size = 24, className }) => (
  <svg {...svgProps(size)} className={className}>
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
  </svg>
);

export const TwitchIcon = ({ size = 24 }) => (
  <svg {...svgProps(size)}>
    <path d="M4.3 2 3 5.4v13.7h4.6V22h2.6l2.9-2.9h3.7L21 14.9V2Zm15.1 12-2.9 2.9h-4.6l-2.6 2.6v-2.6H5.4V3.6h14Zm-2.9-6v5h-1.6V8Zm-4.3 0v5h-1.6V8Z" />
  </svg>
);

// Portal-gun "P2SR wiki" glyph shown next to the wiki link on map pages.
export const WikiIcon = ({ size = 22 }) => (
  <svg {...svgProps(size)}>
    <path d="M9 2h3v8.5L15.5 7 17 8.5 13 12.5V22h-3v-6l-3.5 3.5L5 18l4-4Zm6.5 9.5L19 15l-1.5 1.5L14 13Z" />
  </svg>
);
