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
import Compare from "./pages/Compare";

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
        <Route path="/leaderboard/game/:gameId" element={<Aggregated />} />
        <Route path="/leaderboard/game/:gameId/:board" element={<Aggregated />} />
        <Route path="/leaderboard/:kind" element={<Aggregated />} />
        <Route path="/leaderboard/mel" element={<Navigate to="/leaderboard/mel/overall" replace />} />
        <Route path="/leaderboard/mel/:kind" element={<Aggregated game="mel" />} />
        <Route path="/profile/:profileId" element={<Profile />} />
        <Route path="/more/settings" element={<Settings />} />
        <Route path="/more/wall-of-shame" element={<WallOfShame />} />
        <Route path="/more/donators" element={<Donators />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/more/about" element={<About />} />
        <Route path="/more/:page" element={<Placeholder />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </Router>
  );
}

export default App;
