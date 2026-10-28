/**
 * The race's months from the first one anyone held a record in. A board's months all start with
 * the site's first record, so co-op (whose records began later) opened on months of nothing.
 */
export function fromFirstRecord<F extends { top: unknown[] }>(frames: F[]): F[] {
  const first = frames.findIndex((f) => f.top.length > 0)
  return first < 0 ? [] : frames.slice(first)
}
