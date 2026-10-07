//! Each person's tool data is encrypted on disk (notes, AI chats, class lists).
//!
//! The page encrypts every value it writes to `tools-u<id>.json` with AES-GCM
//! (src/tools/shared/vault.ts). The key is random, one per person, and lives here:
//! - **Windows:** protected with DPAPI (CryptProtectData), so it only opens for
//!   the same Windows account. Another account, or someone who copies the files
//!   away, can't read anything. (On a lab PC where everyone shares one Windows
//!   account, it still stops anyone opening the files in Notepad.)
//! - **macOS:** a private file (0600) in the app's data folder. The Keychain
//!   would ask for a password after every update of an ad-hoc signed app.
//!
//! On shared computers, Settings → Account → "Remove my data when I sign out"
//! deletes the person's tool file and key when they sign out (`on_sign_out`).

use base64::Engine;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

const WIPE_KEY: &str = "wipeOnSignOut";

fn key_path<R: Runtime>(app: &AppHandle<R>, user_id: u64) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vault");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("u{user_id}.key")))
}

/// The person's key (made on first use), base64.
pub fn key_for<R: Runtime>(app: &AppHandle<R>, user_id: u64) -> Result<String, String> {
    let path = key_path(app, user_id)?;
    let raw = match std::fs::read(&path) {
        Ok(sealed) => protect::open(&sealed)?,
        Err(_) => {
            let mut key = vec![0u8; 32];
            getrandom::fill(&mut key).map_err(|e| e.to_string())?;
            let sealed = protect::seal(&key)?;
            write_private(&path, &sealed)?;
            key
        }
    };
    if raw.len() != 32 {
        return Err("bad key".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(raw))
}

fn write_private(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, bytes).map_err(|e| e.to_string())
    }
}

/// For the signed-in person only: the key their tool data is encrypted with.
#[tauri::command]
pub fn tools_vault_key<R: Runtime>(app: AppHandle<R>, user_id: u64) -> Result<String, String> {
    let current = super::identity::get(&app).ok_or("nobody is signed in")?;
    if current.user_id != user_id {
        return Err("not the signed-in person".into());
    }
    key_for(&app, user_id)
}

/// Settings → Account → "Remove my data from this computer when I sign out".
pub fn wipe_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(WIPE_KEY))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// Deletes a person's tool data and key from this computer.
pub fn wipe<R: Runtime>(app: &AppHandle<R>, user_id: u64) {
    let file = format!("tools-u{user_id}.json");
    if let Ok(store) = app.store(&file) {
        store.clear();
        let _ = store.save();
    }
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::remove_file(dir.join(&file));
    }
    if let Ok(p) = key_path(app, user_id) {
        let _ = std::fs::remove_file(p);
    }
    log::info!("tools: removed a person's tool data (sign-out on a shared computer)");
}

/// Identity went from `prev` to someone else or nobody: wipe `prev`'s data if asked.
pub fn on_sign_out<R: Runtime>(app: &AppHandle<R>, prev: u64) {
    if wipe_enabled(app) {
        wipe(app, prev);
    }
}

#[cfg(windows)]
mod protect {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn call(input: &[u8], seal: bool) -> Result<Vec<u8>, String> {
        let mut inp = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        // SAFETY: `inp` points at `input` for the call; `out` is filled by the API
        // and freed with LocalFree below.
        let ok = unsafe {
            if seal {
                CryptProtectData(
                    &mut inp,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut out,
                )
            } else {
                CryptUnprotectData(
                    &mut inp,
                    std::ptr::null_mut(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut out,
                )
            }
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        // SAFETY: the API returned `cbData` bytes at `pbData`.
        let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
        unsafe { LocalFree(out.pbData as _) };
        Ok(bytes)
    }

    pub fn seal(key: &[u8]) -> Result<Vec<u8>, String> {
        call(key, true)
    }
    pub fn open(sealed: &[u8]) -> Result<Vec<u8>, String> {
        call(sealed, false)
    }
}

#[cfg(not(windows))]
mod protect {
    pub fn seal(key: &[u8]) -> Result<Vec<u8>, String> {
        Ok(key.to_vec())
    }
    pub fn open(sealed: &[u8]) -> Result<Vec<u8>, String> {
        Ok(sealed.to_vec())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn sealing_round_trips() {
        let key = [7u8; 32];
        let sealed = super::protect::seal(&key).unwrap();
        assert_eq!(super::protect::open(&sealed).unwrap(), key);
    }
}
