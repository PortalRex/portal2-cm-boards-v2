import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import ScoreUpdates from "./pages/ScoreUpdates";
import MapList from "./pages/MapList";
import MapPage from "./pages/MapPage";
import Aggregated from "./pages/Aggregated";
import Profile from "./pages/Profile";
import Placeholder from "./pages/Placeholder";
import Settings from "./pages/Settings";
import WallOfShame from "./pages/WallOfShame";
import Admin from "./pages/Admin";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<ScoreUpdates />} />
        <Route path="/maps" element={<MapList />} />
        <Route path="/map/:mode/:levelId" element={<MapPage />} />
        <Route path="/leaderboard" element={<Navigate to="/leaderboard/overall" replace />} />
        <Route path="/leaderboard/chapter/:chapterId" element={<Aggregated />} />
        <Route path="/leaderboard/:kind" element={<Aggregated />} />
        <Route path="/leaderboard/mel" element={<Navigate to="/leaderboard/mel/overall" replace />} />
        <Route path="/leaderboard/mel/:kind" element={<Aggregated game="mel" />} />
        <Route path="/profile/:profileId" element={<Profile />} />
        {/* Full-game boards are switched off for now (pages kept in pages/FullGame). */}
        <Route path="/fullgame/*" element={<Navigate to="/" replace />} />
        <Route path="/more/fullgame" element={<Navigate to="/" replace />} />
        <Route path="/more/settings" element={<Settings />} />
        <Route path="/more/wall-of-shame" element={<WallOfShame />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/more/:page" element={<Placeholder />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </Router>
  );
}

export default App;
