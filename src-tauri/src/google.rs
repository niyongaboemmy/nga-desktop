//! "Continue with Google" for NGA MIS, through the system browser.
//!
//! Google refuses OAuth inside embedded webviews (`disallowed_useragent`), so
//! the Google part runs in the person's normal browser and only MIS's Google
//! *credential* comes back (RFC 8252, loopback redirect):
//!
//! 1. The MIS sign-in page (in desktop) links to `/desktop/google`. The shell
//!    intercepts that link instead of loading it.
//! 2. Rust listens once on `127.0.0.1:<random port>` and opens the default
//!    browser at `https://mis.amashuri.com/desktop/google?redirect_uri=
//!    http://127.0.0.1:<port>/google&state=<random>`.
//! 3. That MIS page shows Google's button. On success it POSTs
//!    `{credential, state}` to the loopback URL.
//! 4. Rust checks `state`, answers "you can close this tab", brings NGA to
//!    the front and opens MIS at `/login?desktop_google=1#credential=…`. The
//!    MIS page there exchanges it with the existing `POST /auth/google`, so
//!    the MIS token is created and stored inside MIS's own origin.
//!
//! The credential is a short-lived Google ID token for MIS's client id. It
//! goes browser → loopback → MIS webview fragment (fragments never reach a server).

use crate::registry;
use crate::webviews::{self, Shell};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

pub const START_PATH: &str = "/desktop/google";
const WAIT: Duration = Duration::from_secs(300);
/// Each new flow bumps this; an older listener sees it changed and stops.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Is this the MIS "Continue with Google (desktop)" link?
pub fn is_start(apps: &[registry::AppDef], url: &Url) -> bool {
    registry::identity_provider(apps).owns(url) && url.path() == START_PATH && url.query().is_none()
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("OS randomness");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// A Google ID token is a JWT: three base64url parts.
pub fn plausible_credential(c: &str) -> bool {
    c.len() > 40
        && c.len() < 8192
        && c.split('.').count() == 3
        && c.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            log::warn!("Google sign-in: cannot listen on loopback: {e}");
            return;
        }
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let state = random_hex(16);
    let mis = registry::identity_provider(&app.state::<Shell>().apps)
        .origin
        .clone();
    let mut url = Url::parse(&format!("{mis}{START_PATH}")).expect("valid url");
    url.query_pairs_mut()
        .append_pair("redirect_uri", &format!("http://127.0.0.1:{port}/google"))
        .append_pair("state", &state);
    log::info!("Google sign-in: waiting on 127.0.0.1:{port}");
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::warn!("Google sign-in: cannot open the browser: {e}");
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = listener.set_nonblocking(true);
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline && GENERATION.load(Ordering::SeqCst) == gen {
            match listener.accept() {
                Ok((stream, _)) => {
                    if let Some(credential) = handle(stream, &state) {
                        finish(&app, credential);
                        return;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(150))
                }
                Err(_) => return,
            }
        }
        log::info!("Google sign-in: listener closed");
    });
}

/// Read one HTTP request; answer it; return the credential if it is the right one.
fn handle(mut stream: TcpStream, state: &str) -> Option<String> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).ok()?;
    let mut length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                length = v.trim().parse().unwrap_or(0).min(16_384);
            }
        }
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).ok()?;

    let ok_path = request_line.starts_with("POST /google ");
    let form: Vec<(String, String)> = url::form_urlencoded::parse(&body).into_owned().collect();
    let get = |k: &str| {
        form.iter()
            .find(|(key, _)| key == k)
            .map(|(_, v)| v.clone())
    };
    let credential = get("credential").filter(|c| plausible_credential(c));
    let good = ok_path && get("state").as_deref() == Some(state) && credential.is_some();

    let (status, text) = if good {
        (
            "200 OK",
            "You're signed in to NGA. You can close this tab and go back to the app.",
        )
    } else {
        (
            "400 Bad Request",
            "This sign-in link is not valid any more. Start again from the NGA app.",
        )
    };
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>NGA</title><body style=\"font:16px system-ui;margin:15vh auto;max-width:28rem;text-align:center\"><h1 style=\"font-size:20px\">NGA</h1><p>{text}</p><script>setTimeout(function(){{window.close()}},800)</script>"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    if good {
        credential
    } else {
        None
    }
}

fn finish<R: Runtime>(app: &AppHandle<R>, credential: String) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = handle.get_window(webviews::WINDOW) {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        let shell = handle.state::<Shell>();
        let mis = registry::identity_provider(&shell.apps);
        let Ok(mut url) = Url::parse(&format!("{}/login?desktop_google=1", mis.origin)) else {
            return;
        };
        url.set_fragment(Some(&format!("credential={credential}")));
        let key = mis.key;
        log::info!("Google sign-in: credential received, finishing in MIS");
        let _ = webviews::open_app(&handle, key, Some(url));
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{apps_for, Env};

    #[test]
    fn only_the_bare_mis_start_link_is_intercepted() {
        let apps = apps_for(Env::Production);
        assert!(is_start(
            &apps,
            &Url::parse("https://mis.amashuri.com/desktop/google").unwrap()
        ));
        // The browser-side page (with its parameters) must load normally.
        assert!(!is_start(
            &apps,
            &Url::parse("https://mis.amashuri.com/desktop/google?state=x").unwrap()
        ));
        assert!(!is_start(
            &apps,
            &Url::parse("https://tupo.amashuri.com/desktop/google").unwrap()
        ));
    }

    #[test]
    fn credential_shape() {
        let jwt = format!("{}.{}.{}", "a".repeat(30), "b".repeat(60), "c-_".repeat(20));
        assert!(plausible_credential(&jwt));
        assert!(!plausible_credential("abc.def"));
        assert!(!plausible_credential(&format!("{jwt}#x")));
    }

    #[test]
    fn loopback_accepts_only_the_right_state() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let jwt = format!("{}.{}.{}", "a".repeat(30), "b".repeat(60), "c".repeat(40));
        let send = |state: &str| {
            let body = format!("credential={jwt}&state={state}");
            let mut c = TcpStream::connect(addr).unwrap();
            write!(c, "POST /google HTTP/1.1\r\nHost: x\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
            let (s, _) = listener.accept().unwrap();
            let got = handle(s, "good");
            let mut reply = String::new();
            let _ = c.read_to_string(&mut reply);
            (got, reply)
        };
        let (got, reply) = send("bad");
        assert!(got.is_none() && reply.starts_with("HTTP/1.1 400"));
        let (got, reply) = send("good");
        assert_eq!(got.as_deref(), Some(jwt.as_str()));
        assert!(reply.starts_with("HTTP/1.1 200"));
    }
}
