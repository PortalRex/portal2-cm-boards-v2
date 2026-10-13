// Icon set used across the boards. Most come from @mui/icons-material; the
// brand marks MUI doesn't ship are drawn inline.
export { default as HistoryIcon } from "@mui/icons-material/History";
export { default as TimerIcon } from "@mui/icons-material/TimerOutlined";
export { default as PinIcon } from "@mui/icons-material/LocationOnOutlined";
export { default as BarsIcon } from "@mui/icons-material/BarChartRounded";
export { default as MoreIcon } from "@mui/icons-material/MoreHoriz";
export { default as TrophyIcon } from "@mui/icons-material/EmojiEvents";
export { default as DownloadIcon } from "@mui/icons-material/Download";
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
