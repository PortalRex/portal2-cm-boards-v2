import { Link } from "react-router-dom";
import { SearchIcon, FilterIcon, TriangleLeft, TriangleRight, TriangleDown, TrophyIcon } from "./Icons";
import { countryName } from "../data/countries";
import { rankTextColor, WR_COLOR } from "../lib/ranks";
import "./ui.css";

export function Panel({ icon: Icon, title, actions, className = "", bodyClassName = "", children }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head">
          {Icon && <Icon className="panel-head-icon" />}
          <h2>{title}</h2>
          {actions && <div className="panel-head-actions">{actions}</div>}
        </header>
      )}
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Card({ icon: Icon, title, className = "", children }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        {Icon && <Icon className="card-head-icon" />}
        <h3>{title}</h3>
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

// Page window shown as: ◀ 1 2 3 4 … ▶
export function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  const pages = [];
  const start = Math.max(0, Math.min(page - 1, pageCount - 4));
  for (let i = start; i < Math.min(pageCount, start + 4); i++) pages.push(i);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous page">
        <TriangleLeft />
      </button>
      {pages.map((p) => (
        <button type="button" key={p} className={p === page ? "is-active" : ""} onClick={() => onChange(p)} aria-current={p === page ? "page" : undefined}>
          {p + 1}
        </button>
      ))}
      {start + 4 < pageCount && (
        <button type="button" onClick={() => onChange(Math.min(pageCount - 1, start + 4))} aria-label="More pages">
          …
        </button>
      )}
      <button type="button" onClick={() => onChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} aria-label="Next page">
        <TriangleRight />
      </button>
    </nav>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search", showFilter = true }) {
  return (
    <label className="search-box">
      <SearchIcon className="search-box-icon" />
      <span className="sr-only">{placeholder}</span>
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {showFilter && <FilterIcon className="search-box-filter" />}
    </label>
  );
}

export function Select({ value, onChange, options, className = "", label }) {
  return (
    <div className={`select ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <TriangleDown size={10} />
    </div>
  );
}

export function Avatar({ src, name, size = 46, className = "" }) {
  return src ? (
    <img className={`avatar ${className}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className={`avatar avatar-empty ${className}`} style={{ width: size, height: size }} aria-hidden>
      {name?.[0]?.toUpperCase()}
    </span>
  );
}

export function Flag({ code, height = 20 }) {
  if (!code) return null;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/h40/${code.toLowerCase()}.png`}
      alt={countryName(code)}
      title={countryName(code)}
      style={{ height, width: Math.round(height * 1.5) }}
      loading="lazy"
    />
  );
}

export function PlayerLink({ player, className = "" }) {
  if (!player) return null;
  return player.profileNumber ? (
    <Link className={`player-link ${className}`} to={`/profile/${player.profileNumber}`}>
      {player.name}
    </Link>
  ) : (
    <span className={className}>{player.name}</span>
  );
}

export function YouTubeEmbed({ id, title = "YouTube video" }) {
  if (!id) return <div className="yt-embed yt-empty">No video</div>;
  const [videoId, query] = id.split("?");
  return (
    <div className="yt-embed">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}${query ? `?${query}` : ""}`}
        title={title}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

// "30 ▶ 12" previous/new rank cells used by score updates, numbers coloured by rank.
const rankStyle = (rank) => (rank == null ? undefined : { "--rank-color": rankTextColor(rank, "light"), "--rank-color-dark": rankTextColor(rank, "dark") });

// A run's rank; world records show the old board's pink trophy instead of "1". On
// coloured rank tiles pass `inherit` so the trophy takes the tile's text colour; `colored`
// colours the number by rank (the old board's scale, as in score updates).
export function RankNumber({ rank, empty = "–", inherit = false, colored = false }) {
  if (rank == null) return empty;
  if (rank === 1) {
    return <TrophyIcon className="rank-trophy" style={inherit ? undefined : { color: WR_COLOR }} titleAccess="World record (rank 1)" />;
  }
  return colored ? (
    <span className="rank-colored" style={rankStyle(rank)}>
      {rank}
    </span>
  ) : (
    rank
  );
}

export function RankChange({ pre, post }) {
  return (
    <div className="rank-change num">
      <span className="rank-change-prev" style={rankStyle(pre)}>
        <RankNumber rank={pre} inherit />
      </span>
      <TriangleRight size={12} />
      <span className="rank-change-new" style={rankStyle(post)}>
        <RankNumber rank={post} inherit />
      </span>
    </div>
  );
}

export function Loading({ label = "Loading" }) {
  return <div className="loading" role="status">{label}…</div>;
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>;
}

export function OutlineButton({ as: Tag = "button", children, className = "", ...rest }) {
  return (
    <Tag className={`outline-button ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
