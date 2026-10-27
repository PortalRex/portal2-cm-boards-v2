/** A point of a step line: `setAt` marks a copy carrying a value set earlier, at `setAt`. */
export type StepPoint<T> = T & { setAt?: number; carried?: boolean }

/**
 * Points for a step line (`stepAfter`) whose tooltip shows the value standing wherever you hover.
 * A chart's tooltip goes to the nearest point, so along a long flat stretch it picked up the next
 * step (a later value) or the line's end. Here a stretch wider than 1% of the chart gets a point at
 * both ends carrying its value: one half a percent before the next step (far enough that the step
 * itself is still the nearest point on its own pixel), and the last runs on to `end`. Narrower
 * ones get none. Copies keep when their value was set (`setAt`), for the tooltip's date. Points are
 * sorted by `t`.
 */
export function stepPoints<T extends { t: number; setAt?: number }>(
  points: T[],
  end: number,
): StepPoint<T>[] {
  const out: StepPoint<T>[] = []
  const minGap = points.length ? (end - points[0]!.t) / 100 : 0
  points.forEach((p, i) => {
    const prev = points[i - 1]
    if (prev && p.t - prev.t > minGap)
      out.push({ ...prev, t: p.t - minGap / 2, carried: true, setAt: prev.setAt ?? prev.t })
    out.push(p)
  })
  const last = points[points.length - 1]
  if (last && end > last.t) out.push({ ...last, t: end, carried: true, setAt: last.setAt ?? last.t })
  return out
}
