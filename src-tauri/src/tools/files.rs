//! Save what a tool made (a QR code, a note) to the Downloads folder.

use base64::Engine;
use tauri::{AppHandle, Manager, Runtime};

const MAX_BYTES: usize = 10 * 1024 * 1024;
const EXTENSIONS: [&str; 5] = ["png", "svg", "md", "txt", "csv"];

/// A safe file name: letters, digits, spaces, dots, dashes, underscores; a known extension.
pub fn safe_name(name: &str) -> Option<String> {
    let name = name.trim();
    let (stem, ext) = name.rsplit_once('.')?;
    let ext = ext.to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    let stem: String = stem
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " -_".contains(c) {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches(|c: char| c == '-' || c == ' ' || c == '.')
        .chars()
        .take(80)
        .collect();
    let stem = if stem.is_empty() {
        "nga".to_string()
    } else {
        stem
    };
    Some(format!("{stem}.{ext}"))
}

/// `name (2).ext`, `name (3).ext`… for the first name not taken.
fn unique(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    if !path.exists() {
        return path;
    }
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
    (2..1000)
        .map(|n| dir.join(format!("{stem} ({n}).{ext}")))
        .find(|p| !p.exists())
        .unwrap_or(path)
}

/// Write `data` (base64) to Downloads; returns the full path.
#[tauri::command]
pub fn tools_save_file<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    data: String,
) -> Result<String, String> {
    let name = safe_name(&name).ok_or("That kind of file can't be saved")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|_| "bad data")?;
    if bytes.len() > MAX_BYTES {
        return Err("Too big to save".into());
    }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let path = unique(&dir, &name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    log::info!(
        "tools: saved a .{} file to Downloads",
        name.rsplit('.').next().unwrap_or("")
    );
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_made_safe() {
        assert_eq!(safe_name("qr-code.png").as_deref(), Some("qr-code.png"));
        assert_eq!(safe_name("My note.MD").as_deref(), Some("My note.md"));
        assert_eq!(
            safe_name("../../etc/passwd.txt").as_deref(),
            Some("etc-passwd.txt")
        );
        assert_eq!(safe_name("a/b\\c:d.svg").as_deref(), Some("a-b-c-d.svg"));
        assert_eq!(safe_name(".png").as_deref(), Some("nga.png"));
        assert_eq!(safe_name("virus.exe"), None);
        assert_eq!(safe_name("noext"), None);
    }

    #[test]
    fn existing_files_are_never_overwritten() {
        let dir = std::env::temp_dir().join(format!("nga-files-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.txt"), "x").unwrap();
        std::fs::write(dir.join("a (2).txt"), "x").unwrap();
        assert_eq!(unique(&dir, "a.txt"), dir.join("a (3).txt"));
        assert_eq!(unique(&dir, "b.txt"), dir.join("b.txt"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
