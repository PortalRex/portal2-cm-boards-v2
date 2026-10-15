import { useEffect, useState } from "react";

// How Score Updates marks who set a PB with a co-op run: "icon" (a trophy, the default) or
// "border" (an outline round the player in their colour). Remembered per browser and shared by
// every open page.
const KEY = "p2cm.coopPbStyle";
const EVENT = "p2cm-coop-pb-style";
export const COOP_PB_STYLES = [
  { value: "icon", label: "Trophy" },
  { value: "border", label: "Border" },
];

function saved() {
  try {
    return localStorage.getItem(KEY) === "border" ? "border" : "icon";
  } catch {
    return "icon";
  }
}

export default function useCoopPbStyle() {
  const [style, setStyle] = useState(saved);
  useEffect(() => {
    const sync = () => setStyle(saved());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const change = (next) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page view.
    }
    setStyle(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [style, change];
}
