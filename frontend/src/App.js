import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import ScoreUpdates from "./pages/ScoreUpdates";
import MapList from "./pages/MapList";
import MapPage from "./pages/MapPage";
import Aggregated from "./pages/Aggregated";
import Profile from "./pages/Profile";
import Placeholder from "./pages/Placeholder";
import About from "./pages/About";
import Settings from "./pages/Settings";
import WallOfShame from "./pages/WallOfShame";
import Donators from "./pages/Donators";
import Admin from "./pages/Admin";
import Stats from "./pages/Stats";
import PrivateGate from "./components/PrivateGate";

// An old address sent to its new one, keeping the query string (e.g. /compare?a=..&b=..).
function Moved({ to }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <PrivateGate>
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<ScoreUpdates />} />
        <Route path="/maps" element={<MapList />} />
        <Route path="/map/:mode/:levelId" element={<MapPage />} />
        <Route path="/leaderboard" element={<Navigate to="/leaderboard/overall" replace />} />
        <Route path="/leaderboard/chapter/:chapterId" element={<Aggregated />} />
        <Route path="/leaderboard/game/:gameId" element={<Aggregated />} />
        <Route path="/leaderboard/game/:gameId/:board" element={<Aggregated />} />
        <Route path="/leaderboard/:kind" element={<Aggregated />} />
        <Route path="/leaderboard/mel" element={<Navigate to="/leaderboard/mel/overall" replace />} />
        <Route path="/leaderboard/mel/:kind" element={<Aggregated game="mel" />} />
        <Route path="/profile/:profileId" element={<Profile />} />
        <Route path="/more/settings" element={<Settings />} />
        <Route path="/more/wall-of-shame" element={<WallOfShame />} />
        <Route path="/more/donators" element={<Donators />} />
        <Route path="/more/countries" element={<Moved to="/stats/countries" />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/stats/records" element={<Stats tab="records" />} />
        <Route path="/stats/history" element={<Stats tab="history" />} />
        <Route path="/stats/race" element={<Stats tab="race" />} />
        <Route path="/stats/times" element={<Stats tab="times" />} />
        <Route path="/stats/compare" element={<Stats tab="compare" />} />
        <Route path="/stats/countries" element={<Stats tab="countries" />} />
        <Route path="/compare" element={<Moved to="/stats/compare" />} />
        <Route path="/more/about" element={<About />} />
        <Route path="/more/:page" element={<Placeholder />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </Router>
    </PrivateGate>
  );
}

export default App;
