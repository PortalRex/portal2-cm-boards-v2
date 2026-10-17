import { useEffect, useState } from "react";
import TopBar from "./TopBar";
import { offlineSources, onOfflineChange } from "../api/http";
import { API_BASE } from "../api/config";
import useGame, { gameBackground } from "../hooks/useGame";
import { useDataVersion } from "../lib/dataVersion";
import siteBackground from "../scenes/global/img/Background.png";
import boardsBackground from "../scenes/global/img/OverallOpaque.png";
import "./Layout.css";

// The site-wide backgrounds, replaced by the game's own when it has one (a map's picture or a
// player's avatar stays).
const SITE_BACKGROUNDS = new Set([siteBackground, boardsBackground]);

// Full-page background image (dimmed, optionally blurred) with the transparent
// top bar and a centred content column on top.
export default function Layout({ background: pageBackground, blur = false, tint = "dark", narrow = false, children }) {
  const game = useGame();
  // Re-read after the games editor changes a game's background.
  useDataVersion();
  const background = SITE_BACKGROUNDS.has(pageBackground) ? gameBackground(game) || pageBackground : pageBackground;
  return (
    <div className="layout">
      <div
        className={`layout-bg${blur ? " is-blurred" : ""} tint-${tint}`}
        style={background ? { backgroundImage: `url("${background}")` } : undefined}
        aria-hidden
      />
      <TopBar />
      <main className={`layout-main${narrow ? " is-narrow" : ""}`}>{children}</main>
      <SampleDataNotice />
    </div>
  );
}

function SampleDataNotice() {
  const [offline, setOffline] = useState(offlineSources());
  useEffect(() => onOfflineChange(setOffline), []);
  if (!offline.length) return null;
  return (
    <div className="sample-notice" title={`Could not reach ${API_BASE}`}>
      Sample data · API offline
    </div>
  );
}
