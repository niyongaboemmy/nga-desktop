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

use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
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

/// Call once at start-up with what to do when a banner is clicked.
pub fn init(on_click: impl Fn(u64) + Send + Sync + 'static) {
    #[cfg(target_os = "macos")]
    mac::init(Box::new(on_click));
    #[cfg(not(target_os = "macos"))]
    let _ = on_click;
}

pub fn show<R: Runtime>(app: &AppHandle<R>, b: Banner<'_>) {
    #[cfg(target_os = "macos")]
    if mac::available() {
        mac::show(&b);
        return;
    }
    let body = if b.body.is_empty() {
        b.app_name.to_string()
    } else {
        format!("{}: {}", b.app_name, b.body)
    };
    let mut n = app.notification().builder().title(b.title).body(body);
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
