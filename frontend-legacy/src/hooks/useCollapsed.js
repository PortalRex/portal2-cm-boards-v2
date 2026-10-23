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

function write(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // Storage blocked: the cards still toggle for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
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
    setCollapsed(set.has(id));
    write(set);
  };
  return [collapsed, toggle];
}

// [allCollapsed, toggleAll] for a group of cards: collapses them all, or opens them all when
// they're all collapsed already.
export function useCollapsedGroup(ids) {
  const key = ids.join("|");
  const [all, setAll] = useState(() => ids.every((id) => read().has(id)));
  useEffect(() => {
    const list = key.split("|");
    const sync = () => setAll(list.every((id) => read().has(id)));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);
  const toggleAll = () => {
    const set = read();
    ids.forEach((id) => (all ? set.delete(id) : set.add(id)));
    write(set);
  };
  return [all, toggleAll];
}
