//! Live updates for the staff inbox. Every new audit-log entry is announced by Postgres
//! (`NOTIFY staff_inbox`, a trigger on `admin_actions`, so entries written by anything count), and
//! the server answers the staff browsers waiting on `GET /admin/inbox/wait` straight away.
//! Marking the inbox read is passed on the same way, so a staff member's other open tabs clear
//! their badge too.
use serde::Serialize;
use sqlx::{postgres::PgListener, PgPool};
use std::{sync::OnceLock, time::Duration};
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StaffEvent {
    /// A new audit-log entry, and who made it (none for the board's services).
    Action { id: i64, admin: Option<String> },
    /// `profile` read their inbox up to entry `id`.
    Seen {
        #[serde(skip)]
        profile: String,
        id: i64,
    },
}

#[derive(serde::Deserialize)]
struct Notice {
    id: i64,
    admin: Option<String>,
}

fn channel() -> &'static broadcast::Sender<StaffEvent> {
    static CHANNEL: OnceLock<broadcast::Sender<StaffEvent>> = OnceLock::new();
    CHANNEL.get_or_init(|| broadcast::channel(256).0)
}

/// Events for one waiting inbox.
pub fn subscribe() -> broadcast::Receiver<StaffEvent> {
    channel().subscribe()
}

/// Passes an event on to every open inbox (nobody listening is fine).
pub fn publish(event: StaffEvent) {
    let _ = channel().send(event);
}

/// Listens for new audit-log entries for as long as the server runs.
pub fn start(pool: PgPool) {
    tokio::spawn(async move {
        loop {
            match PgListener::connect_with(&pool).await {
                Ok(mut listener) => {
                    if let Err(e) = listener.listen("staff_inbox").await {
                        log::warn!("staff inbox: can't listen: {e}");
                    } else {
                        // `recv` reconnects by itself; an error means it couldn't.
                        loop {
                            match listener.recv().await {
                                Ok(n) => match serde_json::from_str::<Notice>(n.payload()) {
                                    Ok(notice) => publish(StaffEvent::Action { id: notice.id, admin: notice.admin }),
                                    Err(e) => log::warn!("staff inbox: bad notice {:?}: {e}", n.payload()),
                                },
                                Err(e) => {
                                    log::warn!("staff inbox: listener stopped: {e}");
                                    break;
                                }
                            }
                        }
                    }
                }
                Err(e) => log::warn!("staff inbox: can't connect: {e}"),
            }
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    });
}
