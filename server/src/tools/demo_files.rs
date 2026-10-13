//! Finding a run's demo file for download: submitted demos live in `DEMO.STORAGE`; demos from
//! the old boards are looked up by file name in the `DEMO.ARCHIVE` folders (searched
//! recursively and indexed once, since an archive holds ~180k files).
//!
//! Archive files are named `Map_score_steamid_N.dem`, where N is the old board's id for the
//! run rather than our demo id: for Portal 2 it's the changelog id, for Mel an id we don't
//! keep, so those are found by the rest of the name when only one file has it.
use crate::tools::config::DemoConfig;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::OnceLock,
};

#[derive(Default)]
struct ArchiveIndex {
    by_name: HashMap<String, PathBuf>,
    /// Name without its last `_N` part -> the file, or None when several files share it.
    by_prefix: HashMap<String, Option<PathBuf>>,
}

static ARCHIVE_INDEX: OnceLock<ArchiveIndex> = OnceLock::new();

/// `Map_score_steamid_N.dem` -> `Map_score_steamid`.
fn prefix(name: &str) -> Option<&str> {
    name.rsplit_once('_').map(|(p, _)| p)
}

fn walk(dir: &Path, index: &mut ArchiveIndex) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, index);
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.to_ascii_lowercase().ends_with(".dem") {
                if let Some(p) = prefix(name) {
                    index.by_prefix.entry(p.to_string()).and_modify(|e| *e = None).or_insert_with(|| Some(path.clone()));
                }
                index.by_name.entry(name.to_string()).or_insert(path);
            }
        }
    }
}

/// Archive folders from `DEMO.ARCHIVE` (several separated by `;`).
fn archive_dirs(config: &DemoConfig) -> Vec<PathBuf> {
    config.archive.as_deref().unwrap_or("").split(';').map(str::trim).filter(|d| !d.is_empty()).map(PathBuf::from).collect()
}

async fn archive_index(config: &DemoConfig) -> &'static ArchiveIndex {
    if let Some(index) = ARCHIVE_INDEX.get() {
        return index;
    }
    let dirs = archive_dirs(config);
    let built = tokio::task::spawn_blocking(move || {
        let mut index = ArchiveIndex::default();
        for dir in dirs {
            walk(&dir, &mut index);
        }
        log::info!("demo archive: {} files indexed", index.by_name.len());
        index
    })
    .await
    .unwrap_or_default();
    ARCHIVE_INDEX.get_or_init(|| built)
}

/// The path of a demo file by its stored name (and the run's changelog id, for archive names),
/// if it can be found.
pub async fn locate(config: &DemoConfig, file_id: &str, changelog_id: Option<i64>) -> Option<PathBuf> {
    // Only plain file names (no folders) are looked up.
    let name = Path::new(file_id).file_name()?.to_str()?;
    if name != file_id {
        return None;
    }
    if let Some(storage) = config.storage.as_deref().filter(|s| !s.is_empty()) {
        let path = Path::new(storage).join(name);
        if tokio::fs::metadata(&path).await.is_ok() {
            return Some(path);
        }
    }
    let index = archive_index(config).await;
    if let Some(path) = index.by_name.get(name) {
        return Some(path.clone());
    }
    let p = prefix(name)?;
    if let Some(path) = changelog_id.and_then(|id| index.by_name.get(&format!("{p}_{id}.dem"))) {
        return Some(path.clone());
    }
    index.by_prefix.get(p).cloned().flatten()
}

/// Builds the archive index in the background at startup, so the first download is quick.
pub fn warm(config: DemoConfig) {
    if archive_dirs(&config).is_empty() {
        return;
    }
    tokio::spawn(async move {
        archive_index(&config).await;
    });
}
