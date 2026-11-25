//! The operating system's side of notifications: permission and delivery.
//!
//! **macOS (installed .app):** uses `UNUserNotificationCenter`, the modern API.
//! It shows the system's "Allow notifications from NGA?" prompt, reports
//! whether the person allowed them, groups banners per app (thread id), and
//! tells us which banner was clicked. A dev binary has no bundle, and
//! UNUserNotificationCenter throws without one, so dev falls back to the
//! notification plugin.
//!
//! **Windows:** WinRT toasts through the notification plugin. They're on
//! unless turned off in Settings → System → Notifications, which we link to.
//! A click brings NGA back, and notifications.rs counts that as the click.
//!
//! **Withdrawing banners (DK-ISO-3):** on sign-out, a wipe and a school switch
//! (`withdraw_all`), the banners already delivered leave the OS list, so the
//! next person never reads the previous one's.
//! - macOS (installed .app): UNUserNotificationCenter removes delivered and
//!   pending banners.
//! - Windows: the WinRT toast history (`ToastNotificationHistory::ClearWithId`)
//!   is cleared for the AUMID the notification plugin shows toasts under
//!   (`windows_aumids`): the bundle identifier for an installed NGA, and
//!   PowerShell's AUMID for a binary run from `target\debug|release`. Best
//!   effort: a failure is logged, never fatal.
//!
//! The notification plugin has no remove call on desktop. Banners of the apps
//! that carry private messages (`PRIVATE_APPS`) show no preview (a generic
//! title and the app's name only) wherever `can_withdraw` is false. Windows
//! keeps that fallback for now: the history clear is not yet verified on a
//! real Windows PC with the installed app, so `can_withdraw` stays false there.

use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
// Only macOS reports more than `Unknown`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub enum Permission {
    Granted,
    Denied,
    /// Not asked yet (macOS).
    Prompt,
    /// The OS doesn't tell us (Windows, dev builds): assume on, offer the settings link.
    Unknown,
}

pub struct Banner<'a> {
    pub id: u64,
    pub app_key: &'a str,
    pub app_name: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub sound: bool,
}

/// Apps whose banners carry private messages (Tupo chat and mail). On a
/// system that can't withdraw delivered banners, they show no preview.
pub const PRIVATE_APPS: &[&str] = &["tupo"];

/// The production bundle identifier (tauri.conf.json), used until `init` gives
/// the running app's own.
const DEFAULT_IDENTIFIER: &str = "com.amashuri.nga.desktop";

/// The running app's bundle identifier (set by `init`).
static IDENTIFIER: std::sync::OnceLock<String> = std::sync::OnceLock::new();

#[cfg_attr(not(windows), allow(dead_code))]
fn identifier() -> &'static str {
    IDENTIFIER
        .get()
        .map(String::as_str)
        .unwrap_or(DEFAULT_IDENTIFIER)
}

/// PowerShell's AUMID: Windows toasts shown without an app id (tauri-winrt-notification's
/// `Toast::POWERSHELL_APP_ID`).
#[cfg_attr(not(windows), allow(dead_code))]
const POWERSHELL_AUMID: &str =
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

/// The AUMIDs NGA's Windows toasts can carry, in the order to clear them.
/// The notification plugin sets the app id to the bundle identifier, except
/// when the binary runs from `target/debug` or `target/release` (a dev build),
/// where toasts go out as PowerShell. The identifier is always cleared (an
/// installed NGA may have shown toasts before an update moved it); PowerShell's
/// only for a dev build, so an installed NGA never touches PowerShell's toasts.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn windows_aumids(identifier: &str, exe_dir: Option<&std::path::Path>) -> Vec<String> {
    let mut ids = vec![identifier.to_string()];
    let dev = exe_dir.is_some_and(|dir| {
        let mut parts = dir.components().rev().map(|c| c.as_os_str());
        let last = parts.next();
        let parent = parts.next();
        parent == Some(std::ffi::OsStr::new("target"))
            && (last == Some(std::ffi::OsStr::new("debug"))
                || last == Some(std::ffi::OsStr::new("release")))
    });
    if dev {
        ids.push(POWERSHELL_AUMID.to_string());
    }
    ids
}

/// Can delivered banners be withdrawn on this system?
pub fn can_withdraw() -> bool {
    #[cfg(target_os = "macos")]
    return mac::available();
    #[cfg(not(target_os = "macos"))]
    false
}

/// How many times `withdraw_all` ran (diagnostics and tests).
static WITHDRAWALS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(test)]
pub fn withdrawals() -> usize {
    WITHDRAWALS.load(std::sync::atomic::Ordering::SeqCst)
}

/// Remove every banner NGA delivered (and any still pending) from the OS
/// notification list. Returns whether this system could do it.
pub fn withdraw_all() -> bool {
    WITHDRAWALS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    #[cfg(target_os = "macos")]
    if mac::available() {
        mac::withdraw_all();
        log::info!("OS notifications withdrawn");
        return true;
    }
    #[cfg(windows)]
    {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf));
        let ids = windows_aumids(identifier(), exe_dir.as_deref());
        let cleared = win::withdraw_all(&ids);
        if cleared {
            log::info!("OS notifications withdrawn");
        }
        cleared
    }
    #[cfg(not(windows))]
    false
}

/// Title and body of a banner shown through the notification plugin (no
/// subtitle there). `can_withdraw` false: private apps show no preview.
pub fn plugin_text(b: &Banner<'_>, can_withdraw: bool) -> (String, String) {
    if !can_withdraw && PRIVATE_APPS.contains(&b.app_key) {
        return (
            crate::i18n::t("notice.private").to_string(),
            b.app_name.to_string(),
        );
    }
    let body = if b.body.is_empty() {
        b.app_name.to_string()
    } else {
        format!("{}: {}", b.app_name, b.body)
    };
    (b.title.to_string(), body)
}

/// Call once at start-up with the app's bundle identifier and what to do
/// when a banner is clicked.
pub fn init(identifier: &str, on_click: impl Fn(u64) + Send + Sync + 'static) {
    let _ = IDENTIFIER.set(identifier.to_string());
    #[cfg(target_os = "macos")]
    mac::init(Box::new(on_click));
    #[cfg(not(target_os = "macos"))]
    let _ = on_click;
}

/// Does the OS tell NGA when a banner is clicked? (macOS .app: yes, through
/// UNUserNotificationCenter. Elsewhere the notification plugin doesn't.)
pub fn reports_clicks() -> bool {
    #[cfg(target_os = "macos")]
    return mac::available();
    #[cfg(not(target_os = "macos"))]
    false
}

pub fn show<R: Runtime>(app: &AppHandle<R>, b: Banner<'_>) {
    #[cfg(target_os = "macos")]
    if mac::available() {
        mac::show(&b);
        return;
    }
    let (title, body) = plugin_text(&b, can_withdraw());
    let mut n = app.notification().builder().title(title).body(body);
    if b.sound {
        n = n.sound("default");
    }
    if let Err(e) = n.show() {
        log::warn!("OS notification failed: {e}");
    }
    let _ = (b.id, b.app_key);
}

pub fn permission() -> Permission {
    #[cfg(target_os = "macos")]
    if mac::available() {
        return mac::status();
    }
    Permission::Unknown
}

/// Ask the OS (macOS shows its prompt the first time). Returns the new state.
pub fn request() -> Permission {
    #[cfg(target_os = "macos")]
    if mac::available() {
        return mac::request();
    }
    Permission::Unknown
}

/// Open the OS page where notifications for NGA are turned on or off.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let url = if cfg!(target_os = "macos") {
        format!(
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={}",
            app.config().identifier
        )
    } else if cfg!(windows) {
        "ms-settings:notifications".to_string()
    } else {
        return Err("not supported on this system".into());
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
mod win {
    use windows::core::HSTRING;
    use windows::UI::Notifications::ToastNotificationManager;

    /// Clear the toast history (Action Center) of each AUMID. True when at
    /// least one clear succeeded. Never panics: errors are logged.
    pub fn withdraw_all(aumids: &[String]) -> bool {
        let history = match ToastNotificationManager::History() {
            Ok(h) => h,
            Err(e) => {
                log::warn!("toast history unavailable: {e}");
                return false;
            }
        };
        let mut any = false;
        for id in aumids {
            match history.ClearWithId(&HSTRING::from(id.as_str())) {
                Ok(()) => any = true,
                Err(e) => log::warn!("could not clear toasts of {id}: {e}"),
            }
        }
        any
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{Banner, Permission};
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, msg_send, AllocAnyThread};
    use objc2_foundation::{NSBundle, NSError, NSString};
    use objc2_user_notifications::{
        UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent,
        UNNotification, UNNotificationPresentationOptions, UNNotificationRequest,
        UNNotificationResponse, UNNotificationSettings, UNNotificationSound,
        UNUserNotificationCenter, UNUserNotificationCenterDelegate,
    };
    use std::ptr::NonNull;
    use std::sync::{mpsc, OnceLock};
    use std::time::Duration;

    type OnClick = Box<dyn Fn(u64) + Send + Sync>;
    static ON_CLICK: OnceLock<OnClick> = OnceLock::new();

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "NGANotificationDelegate"]
        struct Delegate;

        unsafe impl NSObjectProtocol for Delegate {}

        unsafe impl UNUserNotificationCenterDelegate for Delegate {
            #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
            fn did_receive(
                &self,
                _center: &UNUserNotificationCenter,
                response: &UNNotificationResponse,
                completion: &block2::DynBlock<dyn Fn()>,
            ) {
                let id = response.notification().request().identifier().to_string();
                if let (Ok(id), Some(cb)) = (id.parse::<u64>(), ON_CLICK.get()) {
                    cb(id);
                }
                completion.call(());
            }

            // Shown even while NGA is in front (notifications.rs already decided it should be).
            #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
            fn will_present(
                &self,
                _center: &UNUserNotificationCenter,
                _notification: &UNNotification,
                completion: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
            ) {
                completion.call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List
                    | UNNotificationPresentationOptions::Sound,));
            }
        }
    );

    /// Only an installed .app has the bundle UNUserNotificationCenter needs.
    pub fn available() -> bool {
        static AVAILABLE: OnceLock<bool> = OnceLock::new();
        *AVAILABLE.get_or_init(|| {
            let bundle = NSBundle::mainBundle();
            bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
        })
    }

    pub fn init(on_click: Box<dyn Fn(u64) + Send + Sync>) {
        let _ = ON_CLICK.set(on_click);
        if !available() {
            return;
        }
        let delegate: Retained<Delegate> = unsafe { msg_send![Delegate::alloc(), init] };
        UNUserNotificationCenter::currentNotificationCenter()
            .setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        // The center keeps a weak reference: keep ours for the life of the app.
        std::mem::forget(delegate);
    }

    pub fn status() -> Permission {
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
            let s = unsafe { settings.as_ref() }.authorizationStatus();
            let _ = tx.send(match s {
                UNAuthorizationStatus::Authorized | UNAuthorizationStatus::Provisional => {
                    Permission::Granted
                }
                UNAuthorizationStatus::Denied => Permission::Denied,
                UNAuthorizationStatus::NotDetermined => Permission::Prompt,
                _ => Permission::Granted,
            });
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .getNotificationSettingsWithCompletionHandler(&block);
        rx.recv_timeout(Duration::from_secs(3))
            .unwrap_or(Permission::Unknown)
    }

    pub fn request() -> Permission {
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |granted: Bool, _err: *mut NSError| {
            let _ = tx.send(if granted.as_bool() {
                Permission::Granted
            } else {
                Permission::Denied
            });
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert
                    | UNAuthorizationOptions::Sound
                    | UNAuthorizationOptions::Badge,
                &block,
            );
        // The person may take a while to answer the system prompt.
        rx.recv_timeout(Duration::from_secs(120))
            .unwrap_or_else(|_| status())
    }

    pub fn withdraw_all() {
        let center = UNUserNotificationCenter::currentNotificationCenter();
        center.removeAllDeliveredNotifications();
        center.removeAllPendingNotificationRequests();
    }

    pub fn show(b: &Banner<'_>) {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(b.title));
        content.setSubtitle(&NSString::from_str(b.app_name));
        content.setBody(&NSString::from_str(b.body));
        // One stack per NGA app in Notification Center.
        content.setThreadIdentifier(&NSString::from_str(b.app_key));
        if b.sound {
            content.setSound(Some(&UNNotificationSound::defaultSound()));
        }
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(&b.id.to_string()),
            &content,
            None,
        );
        UNUserNotificationCenter::currentNotificationCenter()
            .addNotificationRequest_withCompletionHandler(&request, None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn banner<'a>(app_key: &'a str, title: &'a str, body: &'a str) -> Banner<'a> {
        Banner {
            id: 1,
            app_key,
            app_name: "Tupo",
            title,
            body,
            sound: false,
        }
    }

    #[test]
    fn dk_iso_3_private_banners_show_no_preview_when_they_cannot_be_withdrawn() {
        let b = banner("tupo", "Message from Ada", "See you at 3");
        let (title, body) = plugin_text(&b, false);
        assert!(!title.contains("Ada") && !body.contains("See you"));
        assert_eq!(body, "Tupo");
        assert!(!title.is_empty());
        // Withdrawable: the full banner.
        assert_eq!(
            plugin_text(&b, true),
            ("Message from Ada".into(), "Tupo: See you at 3".into())
        );
        // Other apps keep their text.
        let tm = banner("taskmentor", "Quiz opens", "Maths");
        assert_eq!(plugin_text(&tm, false).0, "Quiz opens");
    }

    #[test]
    fn dk_iso_3_windows_clears_the_identifier_and_powershell_only_in_dev() {
        use std::path::Path;
        let id = "com.amashuri.nga.desktop";
        // Installed NGA: only its own AUMID, never PowerShell's toasts.
        assert_eq!(
            windows_aumids(id, Some(Path::new("C:/Program Files/NGA"))),
            vec![id.to_string()]
        );
        assert_eq!(windows_aumids(id, None), vec![id.to_string()]);
        // A test binary (target/debug/deps) is not a dev build either.
        assert_eq!(
            windows_aumids(id, Some(Path::new("/w/src-tauri/target/debug/deps"))).len(),
            1
        );
        // Dev builds: the plugin shows toasts as PowerShell.
        for dir in ["/w/src-tauri/target/debug", "/w/src-tauri/target/release"] {
            let ids = windows_aumids(id, Some(Path::new(dir)));
            assert_eq!(ids, vec![id.to_string(), POWERSHELL_AUMID.to_string()]);
        }
        assert!(POWERSHELL_AUMID.ends_with("powershell.exe"));
    }

    #[test]
    fn dk_iso_3_default_identifier_matches_the_bundle() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"], DEFAULT_IDENTIFIER);
    }

    /// The body of `fn <name>` in `src` (up to the next top-level item).
    /// CRLF checkouts (Windows CI) read as LF.
    fn lf(src: &str) -> String {
        src.replace("\r\n", "\n")
    }

    fn fn_body<'a>(src: &'a str, name: &str) -> &'a str {
        let start = src
            .find(&format!("fn {name}"))
            .unwrap_or_else(|| panic!("fn {name} not found"));
        let rest = &src[start..];
        let end = rest.find("\n}\n").map_or(rest.len(), |i| i + 3);
        &rest[..end]
    }

    #[test]
    fn dk_iso_3_sign_out_wipe_and_switch_withdraw_banners() {
        let call = "crate::os_notify::withdraw_all()";
        // Sign-out (with or without wipe).
        assert!(fn_body(&lf(include_str!("auth.rs")), "sign_out_everywhere").contains(call));
        // Wipe of the local profile (another person signs in).
        assert!(fn_body(&lf(include_str!("commands.rs")), "reset_local_profile").contains(call));
        // Account change or school switch, gated by `withdraw_banners`.
        let identity = lf(include_str!("tools/identity.rs"));
        let gate = identity
            .find("if todo.withdraw_banners {")
            .expect("withdraw_banners gate");
        let block = &identity[gate..];
        let block = &block[..block.find("\n    }\n").expect("end of the gate")];
        assert!(block.contains(call));
    }

    #[test]
    fn dk_iso_3_withdraw_all_is_counted_and_safe_without_a_bundle() {
        let before = withdrawals();
        // A test binary has no .app bundle: nothing to withdraw on macOS, no
        // panic. On Windows the toast history clear runs (best effort) while
        // previews stay hidden (`can_withdraw` false until verified there).
        let done = withdraw_all();
        if cfg!(not(windows)) {
            assert!(!done || can_withdraw());
        }
        assert!(withdrawals() > before);
    }
}
