//! Signing in through the person's browser, like Postman's desktop app.
//!
//! Google refuses OAuth inside embedded webviews (`disallowed_useragent`), and
//! its sign-in popup can't report back to an app window. So NGA signs in to
//! MIS in the person's normal browser (Google, password + OTP, or a session
//! that browser already has) and gets back a one-time code (RFC 8252
//! loopback + RFC 7636 PKCE):
//!
//! 1. MIS's sign-in page (in desktop) links to `/desktop/signin`; Google's own
//!    popup is caught too. The shell intercepts either.
//! 2. Rust makes a PKCE `verifier`, listens once on `127.0.0.1:<random port>`,
//!    and opens the browser at `https://mis.amashuri.com/desktop/signin?
//!    redirect_uri=http://127.0.0.1:<port>/signin&state=<random>&challenge=<S256>`.
//! 3. There, MIS signs the person in and POSTs `{code, state}` to the loopback.
//!    The code is bound to the challenge and lives 2 minutes, once.
//! 4. Rust checks `state`, brings NGA to the front and opens
//!    `/desktop/complete#code=…&verifier=…` in the MIS window, which redeems
//!    it (`POST /auth/desktop-handoff/redeem`). The token is created inside MIS's
//!    own origin; the verifier never went through the browser.
//!
//! MIS side: nga_central_mis `desktop/ngaDesktop.ts`, `utils/desktopHandoff.ts`.

use crate::registry;
use crate::webviews::{self, Shell};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

pub const START_PATH: &str = "/desktop/signin";
const WAIT: Duration = Duration::from_secs(300);
/// Each new flow bumps this; an older listener sees it changed and stops.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Where a sign-in stands, shown by the shell over the MIS area:
/// "waiting" (the person is in their browser), "completing" (the code came
/// back, MIS is signing in), "idle". The browser URL is kept for "Open again".
static PHASE: std::sync::Mutex<&str> = std::sync::Mutex::new("idle");
static LAST_URL: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn set_phase<R: Runtime>(app: &AppHandle<R>, phase: &'static str) {
    *PHASE.lock().unwrap() = phase;
    log::info!("Browser sign-in: {phase}");
    let _ = tauri::Emitter::emit_to(app, crate::webviews::SHELL, "nga://signin", phase);
}

pub fn phase() -> &'static str {
    *PHASE.lock().unwrap()
}

/// MIS finished loading a page: once it is past /desktop/complete, the
/// sign-in is over (signed in, or MIS shows why not).
pub fn on_mis_page<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if phase() == "completing" && url.path() != "/desktop/complete" {
        set_phase(app, "idle");
    }
}

#[tauri::command]
pub fn signin_cancel<R: Runtime>(app: AppHandle<R>) {
    GENERATION.fetch_add(1, Ordering::SeqCst); // the listener stops
    set_phase(&app, "idle");
}

/// The browser tab was closed or lost: open the same sign-in page again.
#[tauri::command]
pub fn signin_reopen<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let url = LAST_URL
        .lock()
        .unwrap()
        .clone()
        .ok_or("no sign-in in progress")?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Is this MIS's "sign in through the browser" link (`/desktop/signin`, bare or
/// `?via=google`)? The browser-side page (with redirect_uri/state/challenge)
/// is never intercepted.
pub fn is_start(apps: &[registry::AppDef], url: &Url) -> bool {
    registry::identity_provider(apps).owns(url)
        && url.path() == START_PATH
        && matches!(url.query(), None | Some("via=google"))
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("OS randomness");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// PKCE (RFC 7636, S256): a 43-character verifier and its challenge.
pub fn pkce_pair() -> (String, String) {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use sha2::{Digest, Sha256};
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("OS randomness");
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// The hand-off code MIS issues is a JWT: three base64url parts.
pub fn plausible_code(c: &str) -> bool {
    c.len() > 40
        && c.len() < 4096
        && c.split('.').count() == 3
        && c.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

pub fn start<R: Runtime>(app: &AppHandle<R>) {
    // One browser tab per click: the link, Google's popup and its retry can
    // all arrive within a moment of each other.
    static LAST: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap();
        if last.is_some_and(|t| t.elapsed() < Duration::from_secs(5)) {
            log::info!("Browser sign-in: already starting, ignored a duplicate");
            return;
        }
        *last = Some(Instant::now());
    }
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            log::warn!("Browser sign-in: cannot listen on loopback: {e}");
            return;
        }
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    let state = random_hex(16);
    let (verifier, challenge) = pkce_pair();
    let mis = registry::identity_provider(&app.state::<Shell>().apps)
        .origin
        .clone();
    let mut url = Url::parse(&format!("{mis}{START_PATH}")).expect("valid url");
    url.query_pairs_mut()
        .append_pair("redirect_uri", &format!("http://127.0.0.1:{port}/signin"))
        .append_pair("state", &state)
        .append_pair("challenge", &challenge)
        // Every way in starts from a Google choice (the desktop Google button,
        // or Google's own popup): the browser page goes straight to Google
        // instead of showing MIS's whole sign-in form again.
        .append_pair("via", "google");
    log::info!("Browser sign-in: waiting on 127.0.0.1:{port}");
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        log::warn!("Browser sign-in: cannot open the browser: {e}");
        return;
    }
    *LAST_URL.lock().unwrap() = Some(url.to_string());
    set_phase(app, "waiting");
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = listener.set_nonblocking(true);
        let deadline = Instant::now() + WAIT;
        while Instant::now() < deadline && GENERATION.load(Ordering::SeqCst) == gen {
            match listener.accept() {
                Ok((stream, _)) => {
                    if let Some(code) = handle(stream, &state) {
                        finish(&app, code, &verifier);
                        return;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(150))
                }
                Err(_) => break,
            }
        }
        log::info!("Browser sign-in: listener closed");
        // Timed out or failed (not replaced by a newer sign-in or a cancel).
        if GENERATION.load(Ordering::SeqCst) == gen && phase() == "waiting" {
            set_phase(&app, "idle");
        }
    });
}

/// Read one HTTP request; answer it; return the code if it is the right one.
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

    let ok_path = request_line.starts_with("POST /signin ");
    let form: Vec<(String, String)> = url::form_urlencoded::parse(&body).into_owned().collect();
    let get = |k: &str| {
        form.iter()
            .find(|(key, _)| key == k)
            .map(|(_, v)| v.clone())
    };
    let code = get("code").filter(|c| plausible_code(c));
    let good = ok_path && get("state").as_deref() == Some(state) && code.is_some();

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
        code
    } else {
        None
    }
}

fn finish<R: Runtime>(app: &AppHandle<R>, code: String, verifier: &str) {
    set_phase(app, "completing");
    // If MIS never leaves /desktop/complete, stop covering it so its message shows.
    let watchdog = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(20));
        if phase() == "completing" {
            set_phase(&watchdog, "idle");
        }
    });
    let verifier = verifier.to_string();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = handle.get_window(webviews::WINDOW) {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        let shell = handle.state::<Shell>();
        let mis = registry::identity_provider(&shell.apps);
        let Ok(mut url) = Url::parse(&format!("{}/desktop/complete", mis.origin)) else {
            return;
        };
        // A fragment: never sent to a server, and the page clears it at once.
        url.set_fragment(Some(&format!("code={code}&verifier={verifier}")));
        let key = mis.key;
        log::info!("Browser sign-in: code received, finishing in MIS");
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
            &Url::parse("https://mis.amashuri.com/desktop/signin").unwrap()
        ));
        assert!(is_start(
            &apps,
            &Url::parse("https://mis.amashuri.com/desktop/signin?via=google").unwrap()
        ));
        // The browser-side page (with its parameters) must load normally.
        assert!(!is_start(
            &apps,
            &Url::parse("https://mis.amashuri.com/desktop/signin?state=x").unwrap()
        ));
        assert!(!is_start(
            &apps,
            &Url::parse("https://tupo.amashuri.com/desktop/signin").unwrap()
        ));
    }

    #[test]
    fn code_shape() {
        let jwt = format!("{}.{}.{}", "a".repeat(30), "b".repeat(60), "c-_".repeat(20));
        assert!(plausible_code(&jwt));
        assert!(!plausible_code("abc.def"));
        assert!(!plausible_code(&format!("{jwt}#x")));
    }

    #[test]
    fn pkce_matches_rfc7636() {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        use base64::Engine;
        use sha2::{Digest, Sha256};
        // RFC 7636 appendix B test vector.
        let v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            URL_SAFE_NO_PAD.encode(Sha256::digest(v.as_bytes())),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let (verifier, challenge) = pkce_pair();
        assert_eq!(verifier.len(), 43);
        assert_eq!(
            challenge,
            URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
        );
    }

    #[test]
    fn loopback_accepts_only_the_right_state() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let jwt = format!("{}.{}.{}", "a".repeat(30), "b".repeat(60), "c".repeat(40));
        let send = |state: &str| {
            let body = format!("code={jwt}&state={state}");
            let mut c = TcpStream::connect(addr).unwrap();
            write!(c, "POST /signin HTTP/1.1\r\nHost: x\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
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
