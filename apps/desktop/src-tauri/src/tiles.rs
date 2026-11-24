//! `tiles://` protocol: serves the bundled PMTiles files with HTTP `Range` support.
//!
//! The Tauri asset protocol ignores `Range` (always 200 with the whole file), which would force the
//! frontend to load the whole California extract into memory. This handler seeks and reads only the
//! requested bytes, so RAM use is independent of the file size.
//!
//! Design:
//! - Only files directly inside the bundled `tiles` resource directory are served (see [`resolve`]).
//! - Only ranged GETs are answered with data (`206`). A missing or unsatisfiable `Range` gets `416`
//!   with `Content-Range: bytes */<len>`; the frontend always sends one.
//! - A single response is capped at [`MAX_CHUNK`] bytes (a shorter `206` is valid per RFC 9110).
//! - CORS: the page origin (`tauri.localhost`) differs from the tiles origin, and `Range` is not a
//!   CORS-safelisted header, so `OPTIONS` preflights are answered too.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};

use tauri::http::{header, Method, Request, Response, StatusCode};

/// Largest number of bytes returned by one response. PMTiles needs the 16 KiB header + root directory,
/// leaf directories (up to a few hundred KiB) and single tiles (well under 1 MiB at z0-z13), so 4 MiB leaves
/// ample headroom while bounding the buffer of each in-flight request.
pub const MAX_CHUNK: u64 = 4 * 1024 * 1024;

/// Number of requests served at once. Peak response memory is `WORKERS * MAX_CHUNK` (32 MiB).
pub const WORKERS: usize = 8;

type Job = Box<dyn FnOnce() + Send + 'static>;

/// Fixed pool of worker threads: bounds both thread count and in-flight response buffers.
/// Excess requests wait in the queue (a queued job holds only its request, no buffer).
pub struct Pool {
    tx: std::sync::mpsc::Sender<Job>,
}

impl Pool {
    pub fn new(workers: usize) -> Self {
        let (tx, rx) = std::sync::mpsc::channel::<Job>();
        let rx = std::sync::Arc::new(std::sync::Mutex::new(rx));
        for _ in 0..workers.max(1) {
            let rx = rx.clone();
            std::thread::spawn(move || loop {
                // The lock is released before the job runs, so workers run jobs in parallel.
                let job = match rx.lock() {
                    Ok(guard) => guard.recv(),
                    Err(_) => return,
                };
                match job {
                    Ok(job) => {
                        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(job));
                    }
                    Err(_) => return,
                }
            });
        }
        Pool { tx }
    }

    pub fn execute(&self, job: impl FnOnce() + Send + 'static) {
        let _ = self.tx.send(Box::new(job));
    }
}

/// Why a `Range` header was refused.
#[derive(Debug, PartialEq, Eq)]
pub enum RangeError {
    Missing,
    Malformed,
    Unsatisfiable,
}

/// Parses a single `bytes=a-b`, `bytes=a-` or `bytes=-n` range against a file of `len` bytes.
/// Returns the inclusive `(start, end)`, with `end` clamped to the file and to [`MAX_CHUNK`].
pub fn parse_range(header: Option<&str>, len: u64) -> Result<(u64, u64), RangeError> {
    let spec = header.ok_or(RangeError::Missing)?.trim();
    let spec = spec.strip_prefix("bytes=").ok_or(RangeError::Malformed)?;
    if spec.contains(',') {
        return Err(RangeError::Unsatisfiable); // multi-range is not supported
    }
    let (a, b) = spec.split_once('-').ok_or(RangeError::Malformed)?;
    let num = |s: &str| -> Result<Option<u64>, RangeError> {
        let s = s.trim();
        if s.is_empty() {
            return Ok(None);
        }
        if !s.bytes().all(|c| c.is_ascii_digit()) {
            return Err(RangeError::Malformed);
        }
        s.parse::<u64>().map(Some).map_err(|_| RangeError::Unsatisfiable)
    };
    let (start, end) = match (num(a)?, num(b)?) {
        (None, None) => return Err(RangeError::Malformed),
        (None, Some(n)) => {
            if n == 0 || len == 0 {
                return Err(RangeError::Unsatisfiable);
            }
            (len.saturating_sub(n), len - 1)
        }
        (Some(s), None) => (s, len.saturating_sub(1)),
        (Some(s), Some(e)) => {
            if e < s {
                return Err(RangeError::Unsatisfiable);
            }
            (s, e.min(len.saturating_sub(1)))
        }
    };
    if len == 0 || start >= len {
        return Err(RangeError::Unsatisfiable);
    }
    Ok((start, end.min(start + MAX_CHUNK - 1)))
}

/// Maps a request path (`/california.pmtiles`) to a file inside `dir`, or `None` when it would escape it.
/// Accepts exactly one plain file name: no separators, `..`, drive prefixes, or encoded forms.
pub fn resolve(dir: &Path, request_path: &str) -> Option<PathBuf> {
    let name = request_path.strip_prefix('/').unwrap_or(request_path);
    if name.is_empty() || name.contains(['/', '\\', ':', '%', '\0']) {
        return None;
    }
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => return None,
    }
    let root = dir.canonicalize().ok()?;
    let file = root.join(name).canonicalize().ok()?; // also follows symlinks
    (file.starts_with(&root) && file.is_file()).then_some(file)
}

fn base(status: StatusCode) -> tauri::http::response::Builder {
    Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Range, Content-Length, Accept-Ranges")
        .header(header::ACCEPT_RANGES, "bytes")
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    base(status).body(Vec::new()).expect("static response")
}

fn read_range(file: &Path, start: u64, end: u64) -> std::io::Result<Vec<u8>> {
    let mut f = File::open(file)?;
    f.seek(SeekFrom::Start(start))?;
    let mut buf = vec![0u8; (end - start + 1) as usize];
    f.read_exact(&mut buf)?;
    Ok(buf)
}

/// Answers one request. `dir` is the bundled tiles directory.
pub fn respond(dir: &Path, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() == Method::OPTIONS {
        return empty(StatusCode::NO_CONTENT);
    }
    if request.method() != Method::GET {
        return empty(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Some(file) = resolve(dir, request.uri().path()) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let Ok(len) = std::fs::metadata(&file).map(|m| m.len()) else {
        return empty(StatusCode::NOT_FOUND);
    };
    let range = request.headers().get(header::RANGE).and_then(|v| v.to_str().ok());
    let Ok((start, end)) = parse_range(range, len) else {
        return base(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{len}"))
            .body(Vec::new())
            .expect("static response");
    };
    match read_range(&file, start, end) {
        Ok(body) => base(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .body(body)
            .expect("static response"),
        Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_forms() {
        assert_eq!(parse_range(Some("bytes=0-99"), 1000), Ok((0, 99)));
        assert_eq!(parse_range(Some("bytes=900-"), 1000), Ok((900, 999)));
        assert_eq!(parse_range(Some("bytes=-100"), 1000), Ok((900, 999)));
        assert_eq!(parse_range(Some("bytes=-5000"), 1000), Ok((0, 999)));
        assert_eq!(parse_range(Some("bytes=990-5000"), 1000), Ok((990, 999)));
        assert_eq!(parse_range(Some("bytes=999-999"), 1000), Ok((999, 999)));
    }

    #[test]
    fn chunk_cap_is_4_mib() {
        assert_eq!(MAX_CHUNK, 4 * 1024 * 1024);
        // A request over the cap is clamped, not refused.
        assert_eq!(parse_range(Some("bytes=0-67108863"), 100 * MAX_CHUNK), Ok((0, MAX_CHUNK - 1)));
    }

    #[test]
    fn pool_bounds_concurrency_and_runs_every_job() {
        use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
        use std::sync::{mpsc, Arc};
        let (running, peak) = (Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0)));
        let (tx, rx) = mpsc::channel();
        let pool = Pool::new(2);
        for _ in 0..8 {
            let (running, peak, tx) = (running.clone(), peak.clone(), tx.clone());
            pool.execute(move || {
                let now = running.fetch_add(1, SeqCst) + 1;
                peak.fetch_max(now, SeqCst);
                std::thread::sleep(std::time::Duration::from_millis(30));
                running.fetch_sub(1, SeqCst);
                tx.send(()).unwrap();
            });
        }
        for _ in 0..8 {
            rx.recv_timeout(std::time::Duration::from_secs(5)).expect("job ran");
        }
        assert!(peak.load(SeqCst) <= 2, "peak {}", peak.load(SeqCst));
        assert_eq!(peak.load(SeqCst), 2);
    }

    #[test]
    fn range_is_capped_to_one_chunk() {
        let len = 10 * MAX_CHUNK;
        assert_eq!(parse_range(Some("bytes=0-"), len), Ok((0, MAX_CHUNK - 1)));
    }

    #[test]
    fn bad_ranges() {
        assert_eq!(parse_range(None, 1000), Err(RangeError::Missing));
        assert_eq!(parse_range(Some("items=0-1"), 1000), Err(RangeError::Malformed));
        assert_eq!(parse_range(Some("bytes=a-b"), 1000), Err(RangeError::Malformed));
        assert_eq!(parse_range(Some("bytes=-"), 1000), Err(RangeError::Malformed));
        assert_eq!(parse_range(Some("bytes=5"), 1000), Err(RangeError::Malformed));
        assert_eq!(parse_range(Some("bytes=1000-1001"), 1000), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=50-10"), 1000), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=-0"), 1000), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=0-1,5-9"), 1000), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=0-1"), 0), Err(RangeError::Unsatisfiable));
        assert_eq!(parse_range(Some("bytes=99999999999999999999-"), 1000), Err(RangeError::Unsatisfiable));
    }

    fn scratch(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("mentalist-tiles-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(d.join("tiles")).unwrap();
        d
    }

    #[test]
    fn path_check_stays_inside_dir() {
        let root = scratch("path");
        let dir = root.join("tiles");
        std::fs::write(dir.join("a.pmtiles"), b"0123456789").unwrap();
        std::fs::write(root.join("secret.txt"), b"x").unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();

        assert!(resolve(&dir, "/a.pmtiles").is_some());
        for bad in [
            "/../secret.txt",
            "/..",
            "/sub/../a.pmtiles",
            "/sub",
            "/missing.pmtiles",
            "/",
            "",
            "/..%2Fsecret.txt",
            "/..\\secret.txt",
            "/C:/Windows/win.ini",
            "/a.pmtiles/",
            "//a.pmtiles",
        ] {
            assert!(resolve(&dir, bad).is_none(), "{bad} must be rejected");
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    fn req(method: &str, range: Option<&str>, path: &str) -> Request<Vec<u8>> {
        let mut b = Request::builder().method(method).uri(format!("http://tiles.localhost{path}"));
        if let Some(r) = range {
            b = b.header("Range", r);
        }
        b.body(Vec::new()).unwrap()
    }

    #[test]
    fn responds_with_only_the_requested_bytes() {
        let root = scratch("respond");
        let dir = root.join("tiles");
        std::fs::write(dir.join("a.pmtiles"), b"ABCDEFG0123456789").unwrap();

        let ok = respond(&dir, &req("GET", Some("bytes=0-6"), "/a.pmtiles"));
        assert_eq!(ok.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(ok.body().as_slice(), b"ABCDEFG");
        assert_eq!(ok.headers()["content-range"], "bytes 0-6/17");
        assert_eq!(ok.headers()["accept-ranges"], "bytes");

        let tail = respond(&dir, &req("GET", Some("bytes=-3"), "/a.pmtiles"));
        assert_eq!(tail.body().as_slice(), b"789");

        let bad = respond(&dir, &req("GET", Some("bytes=99-100"), "/a.pmtiles"));
        assert_eq!(bad.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(bad.headers()["content-range"], "bytes */17");
        assert!(bad.body().is_empty());

        let none = respond(&dir, &req("GET", None, "/a.pmtiles"));
        assert_eq!(none.status(), StatusCode::RANGE_NOT_SATISFIABLE);

        let miss = respond(&dir, &req("GET", Some("bytes=0-1"), "/../x"));
        assert_eq!(miss.status(), StatusCode::NOT_FOUND);

        let pre = respond(&dir, &req("OPTIONS", None, "/a.pmtiles"));
        assert_eq!(pre.status(), StatusCode::NO_CONTENT);
        assert_eq!(pre.headers()["access-control-allow-headers"], "Range");

        let post = respond(&dir, &req("POST", None, "/a.pmtiles"));
        assert_eq!(post.status(), StatusCode::METHOD_NOT_ALLOWED);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_encoded_and_drive_forms() {
        let root = scratch("enc");
        let dir = root.join("tiles");
        std::fs::write(dir.join("a.pmtiles"), b"x").unwrap();
        for bad in ["/%2e%2e", "/%2E%2E%2Fa.pmtiles", "/C:a.pmtiles", "/C:", "/a.pmtiles::$DATA", r"/\\server\share"] {
            assert!(resolve(&dir, bad).is_none(), "{bad}");
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn worker_count_is_8() {
        assert_eq!(WORKERS, 8);
    }

    #[test]
    fn respond_caps_body_at_max_chunk() {
        let root = scratch("cap");
        let dir = root.join("tiles");
        std::fs::write(dir.join("big.pmtiles"), vec![0u8; (MAX_CHUNK + 10) as usize]).unwrap();
        let r = respond(&dir, &req("GET", Some("bytes=0-"), "/big.pmtiles"));
        assert_eq!(r.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(r.body().len() as u64, MAX_CHUNK);
        assert_eq!(r.headers()["content-range"], format!("bytes 0-{}/{}", MAX_CHUNK - 1, MAX_CHUNK + 10));
        std::fs::remove_dir_all(root).unwrap();
    }
}
