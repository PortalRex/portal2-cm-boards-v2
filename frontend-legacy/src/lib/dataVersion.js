import { useEffect, useState } from "react";

// Bumped after an admin change so pages showing board data load it again.
let version = 0;
const EVENT = "p2cm:data-version";

export function bumpDataVersion() {
  version += 1;
  window.dispatchEvent(new Event(EVENT));
}

export function useDataVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    const update = () => setV(version);
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return v;
}
