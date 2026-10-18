import { useCallback, useEffect, useState } from "react";

// Followed players live in this browser only until accounts exist:
// [{ profileNumber, name, avatar }].
const KEY = "p2cm.follows";
const EVENT = "p2cm:follows";

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && p.profileNumber) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked (private window etc.): follows last for this page view only.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: list }));
}

export default function useFollows() {
  const [follows, setFollows] = useState(read);

  useEffect(() => {
    const onLocal = (e) => setFollows(e.detail);
    const onStorage = (e) => e.key === KEY && setFollows(read());
    window.addEventListener(EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isFollowing = useCallback((profileNumber) => follows.some((p) => p.profileNumber === profileNumber), [follows]);

  const toggleFollow = useCallback(
    (player) => {
      const next = isFollowing(player.profileNumber)
        ? follows.filter((p) => p.profileNumber !== player.profileNumber)
        : [...follows, { profileNumber: player.profileNumber, name: player.name, avatar: player.avatar || null }];
      setFollows(next);
      write(next);
    },
    [follows, isFollowing],
  );

  return { follows, isFollowing, toggleFollow };
}
