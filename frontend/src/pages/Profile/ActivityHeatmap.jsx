import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../../components/ui";
import { parseTimestamp } from "../../lib/format";

const DAY = 24 * 3600 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (d) => d.toISOString().slice(0, 10);

// Colour level for a day's run count (0 = none).
const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);

// GitHub-style calendar of a player's submissions: one square per day, a column per week,
// shaded by how many runs were set that day. The past year by default, or any year with runs.
export default function ActivityHeatmap({ history }) {
  const counts = useMemo(() => {
    const m = new Map();
    (history || []).forEach((h) => {
      if (!h.timestamp || h.banned) return;
      const k = dayKey(parseTimestamp(h.timestamp));
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [history]);
  const years = useMemo(() => [...new Set([...counts.keys()].map((k) => Number(k.slice(0, 4))))].sort((a, b) => b - a), [counts]);
  const [range, setRange] = useState("past");
  const scroller = useRef(null);

  const grid = useMemo(() => {
    const today = new Date(dayKey(new Date()) + "T00:00:00Z");
    const end = range === "past" ? today : new Date(Date.UTC(range, 11, 31));
    const start = range === "past" ? new Date(end.getTime() - 364 * DAY) : new Date(Date.UTC(range, 0, 1));
    // Columns start on Sunday.
    const first = new Date(start.getTime() - start.getUTCDay() * DAY);
    const weeks = [];
    let total = 0;
    let busiest = 0;
    for (let w = first; w <= end; w = new Date(w.getTime() + 7 * DAY)) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(w.getTime() + i * DAY);
        const inRange = d >= start && d <= end;
        const n = inRange ? counts.get(dayKey(d)) || 0 : 0;
        if (inRange) {
          total += n;
          busiest = Math.max(busiest, n);
        }
        days.push({ date: d, n, inRange });
      }
      weeks.push(days);
    }
    // Month labels on the first week that starts in that month.
    const labels = weeks.map((days, i) => {
      const m = days[0].date.getUTCMonth();
      return i === 0 || m !== weeks[i - 1][0].date.getUTCMonth() ? MONTHS[m] : "";
    });
    const activeDays = weeks.flat().filter((d) => d.inRange && d.n > 0).length;
    return { weeks, labels, total, busiest, activeDays };
  }, [counts, range]);

  // Phones: start scrolled to the latest weeks.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [grid]);

  if (!counts.size) return null;
  return (
    <div className="pf-activity">
      <div className="pf-activity-head">
        <span className="pf-activity-total">
          <strong className="num">{grid.total}</strong> runs {range === "past" ? "in the past year" : `in ${range}`}
          <span className="muted"> · {grid.activeDays} active days · busiest day {grid.busiest}</span>
        </span>
        <Select
          value={String(range)}
          onChange={(v) => setRange(v === "past" ? "past" : Number(v))}
          options={[{ value: "past", label: "Past year" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
          label="Year"
          className="pf-activity-years"
        />
      </div>
      <div className="pf-activity-scroll" ref={scroller}>
        <div className="pf-activity-grid" style={{ gridTemplateColumns: `24px repeat(${grid.weeks.length}, 13px)` }}>
          <span />
          {grid.labels.map((l, i) => (
            <span key={i} className="pf-activity-month">
              {l}
            </span>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <Row key={row} row={row} weeks={grid.weeks} />
          ))}
        </div>
      </div>
      <div className="pf-activity-legend muted">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`pf-activity-cell is-l${l}`} />
        ))}
        More
      </div>
    </div>
  );
}

function Row({ row, weeks }) {
  return (
    <>
      <span className="pf-activity-day muted">{row === 1 ? "Mon" : row === 3 ? "Wed" : row === 5 ? "Fri" : ""}</span>
      {weeks.map((days, i) => {
        const d = days[row];
        if (!d.inRange) return <span key={i} />;
        const label = `${d.n} run${d.n === 1 ? "" : "s"} on ${d.date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}`;
        return <span key={i} className={`pf-activity-cell is-l${level(d.n)}`} title={label} aria-label={label} />;
      })}
    </>
  );
}
