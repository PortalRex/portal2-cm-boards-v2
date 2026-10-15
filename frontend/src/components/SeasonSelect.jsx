import { useLocation, useNavigate } from "react-router-dom";
import { Select } from "./ui";
import { seasonOptions, seasonsOf, withSeason } from "../data/seasons";

// All-time or one of `base`'s seasons, kept in the address (?season=) so links and other pages
// follow it. Shows nothing for a game without seasons. `onChange(season)` replaces the default
// (same page, new ?season=).
export default function SeasonSelect({ base, season, onChange, className = "" }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  if (!seasonsOf(base).length) return null;
  const pick = onChange || ((s) => navigate(withSeason(`${pathname}${search}`, s), { replace: true }));
  return <Select value={season || ""} onChange={(v) => pick(v || null)} options={seasonOptions(base)} label="Season" className={className} />;
}
