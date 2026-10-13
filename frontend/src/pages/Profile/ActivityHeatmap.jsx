import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../../components/ui";
import { formatDelta, formatScore, parseTimestamp } from "../../lib/format";

const DAY = 24 * 3600 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (d) => d.toISOString().slice(0, 10);
const fmt = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

// Colour level for a day's run count (0 = none).
const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
// Multi-day squares are shaded relative to the busiest square.
const scaledLevel = (n, max) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

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
  // Month labels on the week holding the 1st; the first week gets its month unless a label follows right after.
  const labels = weeks.map((days) => {
    const d = days.find((x) => x.inRange && x.date.getUTCDate() === 1);
    return d ? MONTHS[d.date.getUTCMonth()] : "";
  });
  if (!labels[0] && !labels[1] && !labels[2]) labels[0] = MONTHS[start.getUTCMonth()];
  return { weeks, labels, total, busiest, activeDays, busiestDay: busiest, span: 1 };
}

const yearGrid = (counts, y) => buildGrid(counts, new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31)));

// The whole career in one calendar-sized grid: each square covers `span` days (sized to fit in
// about a year's worth of squares), filled top to bottom, then left to right.
function allTimeGrid(counts, start, end) {
  const days = Math.round((end - start) / DAY) + 1;
  const span = Math.max(1, Math.ceil(days / 371));
  const weeks = [];
  let total = 0;
  let busiest = 0;
  for (let c = 0; c * span * 7 < days; c++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const from = new Date(start.getTime() + (c * 7 + i) * span * DAY);
      if (from > end) {
        col.push({ inRange: false });
        continue;
      }
      let n = 0;
      for (let k = 0; k < span; k++) n += counts.get(dayKey(new Date(from.getTime() + k * DAY))) || 0;
      const to = new Date(Math.min(from.getTime() + (span - 1) * DAY, end.getTime()));
      total += n;
      busiest = Math.max(busiest, n);
      col.push({ date: from, to, n, inRange: true });
    }
    weeks.push(col);
  }
  // Year labels on the column where each year starts.
  const labels = weeks.map((col, i) => {
    const y = col[0].date.getUTCFullYear();
    return i === 0 || y !== weeks[i - 1][0].date.getUTCFullYear() ? String(y) : "";
  });
  return { weeks, labels, total, busiest, span };
}

// GitHub-style calendar of a player's submissions: one square per day, a column per week,
// shaded by how many runs were set that day. The past year by default, one year, or all time
// (the same-sized grid with each square covering several days).
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
  // The runs behind each day, oldest first, for the hover card.
  const runsByDay = useMemo(() => {
    const m = new Map();
    (history || []).forEach((h) => {
      if (!h.timestamp || h.banned) return;
      const k = dayKey(parseTimestamp(h.timestamp));
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(h);
    });
    m.forEach((list) => list.sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp)));
    return m;
  }, [history]);
  const [tip, setTip] = useState(null);
  const showTip = (d, el) => {
    if (!d?.inRange) return setTip(null);
    const box = el.getBoundingClientRect();
    setTip({ d, x: box.left + box.width / 2, top: box.top, bottom: box.bottom });
  };
  const years = useMemo(() => [...new Set([...counts.keys()].map((k) => Number(k.slice(0, 4))))].sort((a, b) => b - a), [counts]);
  const [range, setRange] = useState("past");
  const scroller = useRef(null);

  const grid = useMemo(() => {
    const today = new Date(dayKey(new Date()) + "T00:00:00Z");
    if (range === "all") {
      const first = [...counts.keys()].sort()[0] || dayKey(today);
      const g = allTimeGrid(counts, new Date(first + "T00:00:00Z"), today);
      // Day-based figures for the summary line.
      g.activeDays = counts.size;
      g.busiestDay = Math.max(0, ...counts.values());
      return g;
    }
    if (range === "past") return buildGrid(counts, new Date(today.getTime() - 364 * DAY), today);
    return yearGrid(counts, range);
  }, [counts, range]);

  // Phones: start scrolled to the latest weeks.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
    setTip(null);
  }, [grid]);

  // The card is fixed-position, so drop it when the page scrolls or on a tap elsewhere.
  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    const away = (e) => !e.target.closest?.(".pf-activity-cell") && setTip(null);
    window.addEventListener("scroll", hide, true);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("pointerdown", away);
    };
  }, [tip]);

  if (!counts.size) return null;
  const when = range === "past" ? "in the past year" : range === "all" ? `since ${years[years.length - 1]}` : `in ${range}`;
  return (
    <div className="pf-activity">
      <div className="pf-activity-head">
        <span className="pf-activity-total">
          <strong className="num">{grid.total.toLocaleString()}</strong> runs {when}
          <span className="muted">
            {" "}
            · {grid.activeDays} active days · busiest day {grid.busiestDay}
            {grid.span > 1 && ` · each square is ${grid.span} days`}
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
        <div
          className="pf-activity-grid"
          style={{ gridTemplateColumns: `24px repeat(${grid.weeks.length}, 13px)` }}
          onMouseLeave={() => setTip(null)}
        >
          <span />
          {grid.labels.map((l, i) => (
            <span key={i} className="pf-activity-month">
              {l}
            </span>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <Row key={row} row={row} grid={grid} onShow={showTip} />
          ))}
        </div>
      </div>
      {tip && <TipCard tip={tip} span={grid.span} runsByDay={runsByDay} />}
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

const TIP_RUNS = 8;

// Hover / tap card: the date (or range) and the runs set then, newest last.
function TipCard({ tip, span, runsByDay }) {
  const { d } = tip;
  const runs = [];
  for (let k = 0; k < span; k++) {
    const day = new Date(d.date.getTime() + k * DAY);
    if (d.to && day > d.to) break;
    runs.push(...(runsByDay.get(dayKey(day)) || []));
  }
  const width = 260;
  const left = Math.min(Math.max(8, tip.x - width / 2), window.innerWidth - width - 8);
  const above = tip.top > window.innerHeight / 2;
  const style = above ? { left, width, bottom: window.innerHeight - tip.top + 8 } : { left, width, top: tip.bottom + 8 };
  return (
    <div className="pf-activity-tip" style={style} role="tooltip">
      <div className="pf-activity-tip-head">
        <strong>{span === 1 ? fmt(d.date) : `${fmt(d.date)} – ${fmt(d.to)}`}</strong>
        <span className="muted">
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
      </div>
      {runs.slice(-TIP_RUNS).map((h) => (
        <div key={h.id} className="pf-activity-tip-run">
          <span className="pf-activity-tip-map">{h.map?.title ?? "Unknown map"}</span>
          <span className="num">{formatScore(h.score)}</span>
          <span className="num muted">{h.scoreDelta != null ? formatDelta(h.scoreDelta) : ""}</span>
          <span className="num muted">{h.postRank ? `#${h.postRank}` : ""}</span>
        </div>
      ))}
      {runs.length > TIP_RUNS && <div className="muted pf-activity-tip-more">and {runs.length - TIP_RUNS} earlier</div>}
    </div>
  );
}

function Row({ row, grid, onShow }) {
  const { weeks, span, busiest } = grid;
  return (
    <>
      <span className="pf-activity-day muted">{span === 1 && (row === 1 ? "Mon" : row === 3 ? "Wed" : row === 5 ? "Fri" : "")}</span>
      {weeks.map((days, i) => {
        const d = days[row];
        if (!d.inRange) return <span key={i} />;
        const runs = `${d.n} run${d.n === 1 ? "" : "s"}`;
        const label = span === 1 ? `${runs} on ${fmt(d.date)}` : `${runs}, ${fmt(d.date)} – ${fmt(d.to)}`;
        const l = span === 1 ? level(d.n) : scaledLevel(d.n, busiest);
        return (
          <span
            key={i}
            className={`pf-activity-cell is-l${l}`}
            aria-label={label}
            onMouseEnter={(e) => onShow(d, e.currentTarget)}
            onClick={(e) => onShow(d, e.currentTarget)}
          />
        );
      })}
    </>
  );
}
