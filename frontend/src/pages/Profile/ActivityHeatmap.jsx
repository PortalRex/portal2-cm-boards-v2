import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../../components/ui";
import { parseTimestamp } from "../../lib/format";

const DAY = 24 * 3600 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (d) => d.toISOString().slice(0, 10);

// Colour level for a day's run count (0 = none).
const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);

// Weeks (Sunday first) covering start..end, each day with its run count, plus month labels and totals.
function buildGrid(counts, start, end) {
  const first = new Date(start.getTime() - start.getUTCDay() * DAY);
  const weeks = [];
  let total = 0;
  let busiest = 0;
  let activeDays = 0;
  for (let w = first; w <= end; w = new Date(w.getTime() + 7 * DAY)) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(w.getTime() + i * DAY);
      const inRange = d >= start && d <= end;
      const n = inRange ? counts.get(dayKey(d)) || 0 : 0;
      if (n) {
        total += n;
        activeDays += 1;
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
  return { weeks, labels, total, busiest, activeDays };
}

const yearGrid = (counts, y) => buildGrid(counts, new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31)));

// GitHub-style calendar of a player's submissions: one square per day, a column per week,
// shaded by how many runs were set that day. The past year by default, one year, or all time
// (a row per year, newest first).
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

  const grids = useMemo(() => {
    if (range === "all") return years.map((y) => ({ year: y, ...yearGrid(counts, y) }));
    if (range === "past") {
      const today = new Date(dayKey(new Date()) + "T00:00:00Z");
      return [{ year: null, ...buildGrid(counts, new Date(today.getTime() - 364 * DAY), today) }];
    }
    return [{ year: null, ...yearGrid(counts, range) }];
  }, [counts, range, years]);
  const summary = grids.reduce(
    (s, g) => ({ total: s.total + g.total, activeDays: s.activeDays + g.activeDays, busiest: Math.max(s.busiest, g.busiest) }),
    { total: 0, activeDays: 0, busiest: 0 },
  );

  // Phones: start scrolled to the latest weeks.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = range === "all" ? 0 : scroller.current.scrollWidth;
  }, [grids, range]);

  if (!counts.size) return null;
  const when = range === "past" ? "in the past year" : range === "all" ? `since ${years[years.length - 1]}` : `in ${range}`;
  return (
    <div className="pf-activity">
      <div className="pf-activity-head">
        <span className="pf-activity-total">
          <strong className="num">{summary.total.toLocaleString()}</strong> runs {when}
          <span className="muted">
            {" "}
            · {summary.activeDays} active days · busiest day {summary.busiest}
          </span>
        </span>
        <Select
          value={String(range)}
          onChange={(v) => setRange(v === "past" || v === "all" ? v : Number(v))}
          options={[
            { value: "past", label: "Past year" },
            { value: "all", label: "All time" },
            ...years.map((y) => ({ value: String(y), label: String(y) })),
          ]}
          label="Year"
          className="pf-activity-years"
        />
      </div>
      <div className="pf-activity-scroll" ref={scroller}>
        <div className="pf-activity-years-list">
          {grids.map((g) => (
            <div key={g.year ?? "range"} className="pf-activity-year">
              {g.year != null && (
                <span className="pf-activity-year-label">
                  {g.year} <span className="muted">· {g.total} runs</span>
                </span>
              )}
              <div className="pf-activity-grid" style={{ gridTemplateColumns: `24px repeat(${g.weeks.length}, 13px)` }}>
                <span />
                {g.labels.map((l, i) => (
                  <span key={i} className="pf-activity-month">
                    {l}
                  </span>
                ))}
                {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                  <Row key={row} row={row} weeks={g.weeks} />
                ))}
              </div>
            </div>
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
