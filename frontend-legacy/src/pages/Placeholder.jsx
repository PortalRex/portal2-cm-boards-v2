import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { Panel, EmptyState } from "../components/ui";
import { MoreIcon } from "../components/Icons";
import background from "../scenes/global/img/Background.png";

const TITLES = {
  discord: "Discord",
  donators: "Donators",
  "wall-of-shame": "Wall Of Shame",
  about: "About",
  settings: "Settings",
};

// The "More" menu pages have no design yet; they share this placeholder.
export default function Placeholder() {
  const { page } = useParams();
  const title = TITLES[page] || "Page not found";
  return (
    <Layout background={background} tint="mono" narrow>
      <Panel icon={MoreIcon} title={title}>
        <EmptyState>{TITLES[page] ? "This page hasn’t been designed yet." : "There’s nothing here."}</EmptyState>
      </Panel>
    </Layout>
  );
}
