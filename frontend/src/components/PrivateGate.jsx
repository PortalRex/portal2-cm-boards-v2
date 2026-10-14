import { useEffect, useState } from "react";
import { fetchMe, fetchSite, logout, steamLoginUrl } from "../api/client";
import { SteamIcon } from "./Icons";
import { isStaff, reloadCurrentUser } from "../hooks/useCurrentUser";
import "./PrivateGate.css";

// Staff-only mode (the server's SERVER.PRIVATE): until launch, only signed-in staff see the
// site; everyone else gets this page with the Steam sign-in. The server enforces it either way.
export default function PrivateGate({ children }) {
  const [state, setState] = useState({ loading: true, private: false, user: null });
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSite().catch(() => ({ private: false })), fetchMe().catch(() => null)]).then(([site, user]) => {
      if (!cancelled) setState({ loading: false, private: Boolean(site?.private), user });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) return <div className="pg-page" aria-busy="true" />;
  if (!state.private || isStaff(state.user)) return children;

  const here = window.location.pathname + window.location.search;
  return (
    <div className="pg-page">
      <div className="pg-panel">
        <h1 className="pg-title">P2CM</h1>
        <p className="pg-text">The new boards are private while staff test them.</p>
        {state.user ? (
          <>
            <p className="pg-text pg-muted">
              You’re signed in as <strong>{state.user.name}</strong>, which isn’t a staff account.
            </p>
            <button
              type="button"
              className="pg-secondary"
              onClick={async () => {
                await logout();
                await reloadCurrentUser();
                setState((s) => ({ ...s, user: null }));
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <a className="pg-signin" href={steamLoginUrl(here)}>
            <SteamIcon size={20} /> Sign in through Steam
          </a>
        )}
      </div>
    </div>
  );
}
