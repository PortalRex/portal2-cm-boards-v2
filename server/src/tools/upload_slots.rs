//! A cap on how many demo uploads the server handles at once. Each upload is held in memory (up
//! to 50 MB) and checked by its own demo parser process for up to 30 s, so without a cap enough
//! players, or addresses, uploading together could run the server out of memory. The per-client
//! rate limits don't cover that: they count each client separately.
//!
//! Every upload endpoint takes a slot before it reads the demo and keeps it until it has answered.
//! When all [SLOTS] are busy, an upload waits up to [WAIT] for one, then is refused with 503 and
//! asked to try again. (nginx receives the whole upload before passing it on, so a slow upload
//! doesn't hold a slot while it trickles in.)
use actix_web::HttpResponse;
use std::time::Duration;
use tokio::sync::{Semaphore, SemaphorePermit};

/// Uploads handled at once.
pub const SLOTS: usize = 4;
/// How long an upload waits for a free slot.
pub const WAIT: Duration = Duration::from_secs(15);

/// A set of upload slots.
pub struct UploadSlots {
    slots: Semaphore,
    wait: Duration,
}

impl UploadSlots {
    pub const fn new(slots: usize, wait: Duration) -> Self {
        Self {
            slots: Semaphore::const_new(slots),
            wait,
        }
    }

    /// A slot (freed when dropped), or the 503 answer once none came free in time.
    pub async fn take(&self) -> Result<SemaphorePermit<'_>, HttpResponse> {
        match tokio::time::timeout(self.wait, self.slots.acquire()).await {
            Ok(Ok(slot)) => Ok(slot),
            _ => Err(HttpResponse::ServiceUnavailable()
                .insert_header(("Retry-After", "30"))
                .body("The server is busy checking other demos. Try again in a minute.")),
        }
    }
}

/// The server's upload slots.
pub static UPLOADS: UploadSlots = UploadSlots::new(SLOTS, WAIT);

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::http::StatusCode;

    #[actix_web::test]
    async fn refuses_once_every_slot_is_taken_and_frees_them_when_done() {
        let slots = UploadSlots::new(2, Duration::from_millis(50));
        let first = slots.take().await.expect("a free slot");
        let second = slots.take().await.expect("a free slot");
        let busy = slots.take().await.expect_err("no slot left");
        assert_eq!(busy.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(busy.headers().get("Retry-After").unwrap(), "30");
        drop(first);
        let third = slots.take().await.expect("the freed slot");
        drop((second, third));
        assert_eq!(slots.slots.available_permits(), 2);
    }

    #[actix_web::test]
    async fn waits_for_a_slot_to_come_free() {
        static SLOTS: UploadSlots = UploadSlots::new(1, Duration::from_secs(2));
        let held = SLOTS.take().await.expect("a free slot");
        let waiting = tokio::spawn(async { SLOTS.take().await.map(|_| ()).map_err(|r| r.status()) });
        tokio::time::sleep(Duration::from_millis(100)).await;
        drop(held);
        assert_eq!(waiting.await.unwrap(), Ok(()));
    }
}
