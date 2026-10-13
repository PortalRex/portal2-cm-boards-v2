import { useEffect, useState } from "react";

// Which cards the viewer has collapsed, remembered in this browser (shared by every page and tab).
const KEY = "p2cm.collapsed";
const EVENT = "p2cm-collapsed";

function read() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

// [collapsed, toggle] for the card named `id`; without an id the card can't collapse.
export default function useCollapsed(id) {
  const [collapsed, setCollapsed] = useState(() => (id ? read().has(id) : false));
  useEffect(() => {
    if (!id) return undefined;
    const sync = () => setCollapsed(read().has(id));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [id]);
  const toggle = () => {
    const set = read();
    if (set.has(id)) set.delete(id);
    else set.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch {
      // Storage blocked: the card still toggles for this visit.
    }
    setCollapsed(set.has(id));
    window.dispatchEvent(new Event(EVENT));
  };
  return [collapsed, toggle];
}
