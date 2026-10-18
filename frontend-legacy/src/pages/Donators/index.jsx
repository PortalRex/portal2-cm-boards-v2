import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { Panel, Avatar, Loading, EmptyState } from "../../components/ui";
import { DonateIcon } from "../../components/Icons";
import { fetchDonators } from "../../api/client";
import useApi from "../../hooks/useApi";
import background from "../../scenes/global/img/Background.png";
import "./Donators.css";

const money = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// Everyone who has donated to the boards, biggest total first.
export default function Donators() {
  const donators = useApi(() => fetchDonators(), []);
  const list = donators.data || [];
  const total = list.reduce((sum, d) => sum + d.amount, 0);

  return (
    <Layout background={background} tint="mono">
      <Panel icon={DonateIcon} title="Donators" bodyClassName="don-body">
        <p className="don-intro">
          Thank you to everyone who has donated to keep the boards running.
          {list.length > 0 && (
            <span className="muted">
              {" "}
              {list.length} donators · {money(total)} in total
            </span>
          )}
        </p>
        {donators.loading && !donators.data ? (
          <Loading />
        ) : !list.length ? (
          <EmptyState>No donations yet.</EmptyState>
        ) : (
          <ol className="don-list">
            {list.map((d, i) => (
              <li key={d.profileNumber}>
                <Link to={`/profile/${d.profileNumber}`} className="don-row">
                  <span className="don-rank num muted">{i + 1}</span>
                  <Avatar src={d.avatar} name={d.name} size={40} />
                  <span className="don-name">{d.name}</span>
                  <span className="don-amount num">{money(d.amount)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </Layout>
  );
}
