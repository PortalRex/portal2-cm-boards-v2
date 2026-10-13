import { useEffect, useState } from "react";
import TopBar from "./TopBar";
import { offlineSources, onOfflineChange } from "../api/http";
import { API_BASE } from "../api/config";
import "./Layout.css";

// Full-page background image (dimmed, optionally blurred) with the transparent
// top bar and a centred content column on top.
export default function Layout({ background, blur = false, tint = "dark", narrow = false, children }) {
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
