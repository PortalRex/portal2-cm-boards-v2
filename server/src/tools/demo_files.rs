//! Finding a run's demo file for download: submitted demos live in `DEMO.STORAGE`; demos from
//! the old boards are looked up by file name in the `DEMO.ARCHIVE` folders (searched
//! recursively and indexed once, since an archive holds ~180k files).
//!
//! Archive files are named `Map_score_steamid_N.dem`, where N is the old board's id for the
//! run rather than our demo id: for Portal 2 it's the changelog id, for Mel an id we don't
//! keep, so those are found by the rest of the name when only one file has it.
//!
//! A demo can be stored gzip-compressed as `<name>.gz` (about 40% of the size). Runs keep the
//! plain `.dem` name, so a file can be compressed in place without touching the database, and
//! everything that reads one goes through [read].
use crate::tools::config::DemoConfig;
use std::{
    collections::HashMap,
    io::{self, Read, Write},
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

/// A demo file's name as runs keep it: `x.dem` for both `x.dem` and `x.dem.gz`.
fn demo_name(file_name: &str) -> Option<&str> {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".dem.gz") {
        Some(&file_name[..file_name.len() - 3])
    } else if lower.ends_with(".dem") {
        Some(file_name)
    } else {
        None
    }
}

/// Whether a located demo file is gzip-compressed.
pub fn is_compressed(path: &Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case("gz"))
}

/// A demo file's contents, unpacked if it's compressed.
pub async fn read(path: &Path) -> io::Result<Vec<u8>> {
    let bytes = tokio::fs::read(path).await?;
    if !is_compressed(path) {
        return Ok(bytes);
    }
    tokio::task::spawn_blocking(move || {
        let mut out = Vec::with_capacity(bytes.len() * 3);
        flate2::read::GzDecoder::new(&bytes[..]).read_to_end(&mut out)?;
        Ok(out)
    })
    .await
    .map_err(io::Error::other)?
}

/// Saves a demo in `dir`, compressed, as `<name>.gz`; returns its path.
pub async fn write(dir: &Path, name: &str, bytes: &[u8]) -> io::Result<PathBuf> {
    let bytes = bytes.to_vec();
    let packed = tokio::task::spawn_blocking(move || {
        let mut enc = flate2::write::GzEncoder::new(Vec::with_capacity(bytes.len() / 2), flate2::Compression::best());
        enc.write_all(&bytes)?;
        enc.finish()
    })
    .await
    .map_err(io::Error::other)??;
    tokio::fs::create_dir_all(dir).await?;
    let path = dir.join(format!("{name}.gz"));
    tokio::fs::write(&path, packed).await?;
    Ok(path)
}

/// Deletes a demo from `dir`, compressed or not.
pub async fn remove(dir: &Path, name: &str) {
    let _ = tokio::fs::remove_file(dir.join(name)).await;
    let _ = tokio::fs::remove_file(dir.join(format!("{name}.gz"))).await;
}

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
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()).and_then(demo_name) {
            // A demo kept both plain and compressed (while it's being compressed) counts once.
            if index.by_name.contains_key(name) {
                continue;
            }
            if let Some(p) = prefix(name) {
                index.by_prefix.entry(p.to_string()).and_modify(|e| *e = None).or_insert_with(|| Some(path.clone()));
            }
            index.by_name.insert(name.to_string(), path);
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
        for file in [name.to_string(), format!("{name}.gz")] {
            let path = Path::new(storage).join(file);
            if tokio::fs::metadata(&path).await.is_ok() {
                return Some(path);
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(demo_name("Portal_1234_7656_99.dem"), Some("Portal_1234_7656_99.dem"));
        assert_eq!(demo_name("Portal_1234_7656_99.dem.gz"), Some("Portal_1234_7656_99.dem"));
        assert_eq!(demo_name("Portal_1234_7656_99.DEM.GZ"), Some("Portal_1234_7656_99.DEM"));
        assert_eq!(demo_name("notes.txt.gz"), None);
        assert!(is_compressed(Path::new("a/x.dem.gz")));
        assert!(!is_compressed(Path::new("a/x.dem")));
    }

    #[actix_web::test]
    async fn compressed_round_trip_and_lookup() {
        let dir = std::env::temp_dir().join(format!("p2boards-demo-files-{}", &crate::tools::auth::random_token()[..12]));
        let demo: Vec<u8> = b"HL2DEMO\0".iter().copied().chain((0..50_000u32).map(|i| (i % 251) as u8)).collect();
        let path = write(&dir, "47458_2733_7656_abc.dem", &demo).await.unwrap();
        assert_eq!(path.file_name().unwrap(), "47458_2733_7656_abc.dem.gz");
        assert!(tokio::fs::metadata(&path).await.unwrap().len() < demo.len() as u64 / 2);
        assert_eq!(read(&path).await.unwrap(), demo);

        // Runs keep the plain name; it finds the compressed file.
        let config = DemoConfig { storage: Some(dir.to_string_lossy().into_owned()), ..Default::default() };
        assert_eq!(locate(&config, "47458_2733_7656_abc.dem", None).await, Some(path.clone()));

        // Archive folders: compressed files are indexed under their plain names, once.
        let mut index = ArchiveIndex::default();
        tokio::fs::write(dir.join("47458_2733_7656_abc.dem"), &demo).await.unwrap();
        walk(&dir, &mut index);
        assert_eq!(index.by_name.len(), 1);
        assert!(index.by_name.contains_key("47458_2733_7656_abc.dem"));
        assert!(index.by_prefix.get("47458_2733_7656").is_some_and(Option::is_some));

        remove(&dir, "47458_2733_7656_abc.dem").await;
        assert_eq!(locate(&config, "47458_2733_7656_abc.dem", None).await, None);
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
}
