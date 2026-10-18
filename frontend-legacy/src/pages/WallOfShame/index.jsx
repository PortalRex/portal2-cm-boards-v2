import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { Panel, SearchBox, Avatar, Loading, EmptyState } from "../../components/ui";
import { MoreIcon } from "../../components/Icons";
import { fetchWallOfShame } from "../../api/client";
import useApi from "../../hooks/useApi";
import background from "../../scenes/global/img/Background.png";
import "./WallOfShame.css";

// Players banned from the boards (their runs are hidden everywhere).
export default function WallOfShame() {
  const banned = useApi(() => fetchWallOfShame(), []);
  const [search, setSearch] = useState("");
  const players = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (banned.data || []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.profileNumber.includes(q));
  }, [banned.data, search]);

  return (
    <Layout background={background} tint="mono">
      <Panel icon={MoreIcon} title="Wall Of Shame" bodyClassName="wos-body">
        <div className="wos-toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Search banned players" showFilter={false} />
          {banned.data && (
            <span className="muted">
              {players.length === banned.data.length ? `${banned.data.length} banned players` : `${players.length} of ${banned.data.length}`}
            </span>
          )}
        </div>
        {banned.loading && !banned.data ? (
          <Loading />
        ) : !players.length ? (
          <EmptyState>{search ? `No banned players match “${search}”.` : "Nobody is banned."}</EmptyState>
        ) : (
          <ul className="wos-grid">
            {players.map((p) => (
              <li key={p.profileNumber}>
                <Link to={`/profile/${p.profileNumber}`} className="wos-card">
                  <Avatar src={p.avatar} name={p.name} size={56} />
                  <span className="wos-name">{p.name}</span>
                  <span className="wos-id num muted">{p.profileNumber}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Layout>
  );
}
