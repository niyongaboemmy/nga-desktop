//! `window.alert` / `confirm` / `prompt` and the "leave this page?" prompt on macOS.
//!
//! WKWebView shows these only if its `WKUIDelegate` implements the
//! `runJavaScript…Panel` methods, and wry's delegate (0.57) does not. Without
//! this, `confirm()` silently returns false (every "Delete this…?" in MIS,
//! Task Mentor and Tupo would do nothing) and `alert()` is ignored.
//!
//! The same goes for `beforeunload` (MIS lesson-note editor, Tendo's
//! attendance register): without the private `_webView:runBeforeUnload…`
//! method, WebKit leaves the page and unsaved work is lost without a word.
//!
//! We add these methods to wry's delegate class at runtime and answer them
//! with native `NSAlert`s. `class_addMethod` refuses to replace an existing
//! method, so if wry ever implements them, theirs wins and this is a no-op.
//! WebView2 (Windows) has its own dialogs; nothing to do there.

use tauri::{Runtime, Webview};

#[cfg(not(target_os = "macos"))]
pub fn install<R: Runtime>(_webview: &Webview<R>) {}

#[cfg(target_os = "macos")]
pub fn install<R: Runtime>(webview: &Webview<R>) {
    let _ = webview.with_webview(|platform| unsafe { mac::install(platform.inner().cast()) });
}

#[cfg(target_os = "macos")]
mod mac {
    use block2::Block;
    use objc2::ffi::class_addMethod;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
    use objc2::{msg_send, sel, MainThreadMarker};
    use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSTextField};
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use std::sync::Once;

    static ONCE: Once = Once::new();

    pub unsafe fn install(wk_webview: *mut AnyObject) {
        if wk_webview.is_null() {
            return;
        }
        let delegate: *mut AnyObject = msg_send![wk_webview, UIDelegate];
        if delegate.is_null() {
            return;
        }
        let class = (*delegate).class() as *const AnyClass as *mut AnyClass;
        ONCE.call_once(|| {
            add(class, sel!(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:),
                alert as *const (), c"v@:@@@@?");
            add(class, sel!(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:),
                confirm as *const (), c"v@:@@@@?");
            add(class, sel!(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:),
                prompt as *const (), c"v@:@@@@@?");
            add(class, sel!(_webView:runBeforeUnloadConfirmPanelWithMessage:initiatedByFrame:completionHandler:),
                before_unload as *const (), c"v@:@@@@?");
            let alert_ok: bool = msg_send![delegate, respondsToSelector: sel!(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:)];
            log::info!("JS dialogs (alert/confirm/prompt) handled natively: {alert_ok}");
        });
    }

    unsafe fn add(class: *mut AnyClass, name: Sel, imp: *const (), types: &std::ffi::CStr) {
        let imp: Imp = std::mem::transmute(imp);
        if !class_addMethod(class, name, imp, types.as_ptr()).as_bool() {
            log::info!("JS dialog method {name} already exists on the WebKit UI delegate");
        }
    }

    /// "mis.amashuri.com" for the frame that asked, like Safari's sheet title.
    unsafe fn host_of(frame: *mut AnyObject) -> String {
        if frame.is_null() {
            return "NGA".into();
        }
        let origin: *mut AnyObject = msg_send![frame, securityOrigin];
        if origin.is_null() {
            return "NGA".into();
        }
        let host: *mut NSString = msg_send![origin, host];
        if host.is_null() {
            "NGA".into()
        } else {
            (*host).to_string()
        }
    }

    unsafe fn text(s: *mut NSString) -> String {
        if s.is_null() {
            String::new()
        } else {
            (*s).to_string()
        }
    }

    /// Run a modal alert; true when the first button was chosen.
    unsafe fn run(
        title: &str,
        message: &str,
        buttons: &[&str],
        field: Option<&NSTextField>,
    ) -> bool {
        let Some(mtm) = MainThreadMarker::new() else {
            return false;
        };
        let alert = NSAlert::new(mtm);
        alert.setMessageText(&NSString::from_str(title));
        alert.setInformativeText(&NSString::from_str(message));
        for b in buttons {
            alert.addButtonWithTitle(&NSString::from_str(b));
        }
        if let Some(field) = field {
            alert.setAccessoryView(Some(field));
            alert.window().setInitialFirstResponder(Some(field));
        }
        alert.runModal() == NSAlertFirstButtonReturn
    }

    unsafe extern "C-unwind" fn alert(
        _this: *mut AnyObject,
        _cmd: Sel,
        _webview: *mut AnyObject,
        message: *mut NSString,
        frame: *mut AnyObject,
        handler: *mut Block<dyn Fn()>,
    ) {
        run(&host_of(frame), &text(message), &["OK"], None);
        if let Some(h) = handler.as_ref() {
            h.call(());
        }
    }

    unsafe extern "C-unwind" fn confirm(
        _this: *mut AnyObject,
        _cmd: Sel,
        _webview: *mut AnyObject,
        message: *mut NSString,
        frame: *mut AnyObject,
        handler: *mut Block<dyn Fn(Bool)>,
    ) {
        let ok = run(&host_of(frame), &text(message), &["OK", "Cancel"], None);
        if let Some(h) = handler.as_ref() {
            h.call((Bool::new(ok),));
        }
    }

    unsafe extern "C-unwind" fn before_unload(
        _this: *mut AnyObject,
        _cmd: Sel,
        _webview: *mut AnyObject,
        _message: *mut NSString,
        frame: *mut AnyObject,
        handler: *mut Block<dyn Fn(Bool)>,
    ) {
        let leave = run(
            &host_of(frame),
            "Leave this page? Changes you made may not be saved.",
            &["Leave", "Stay"],
            None,
        );
        if let Some(h) = handler.as_ref() {
            h.call((Bool::new(leave),));
        }
    }

    unsafe extern "C-unwind" fn prompt(
        _this: *mut AnyObject,
        _cmd: Sel,
        _webview: *mut AnyObject,
        message: *mut NSString,
        default_text: *mut NSString,
        frame: *mut AnyObject,
        handler: *mut Block<dyn Fn(*mut NSString)>,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let field: Retained<NSTextField> = NSTextField::initWithFrame(
            mtm.alloc(),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(280.0, 24.0)),
        );
        field.setStringValue(&NSString::from_str(&text(default_text)));
        let ok = run(
            &host_of(frame),
            &text(message),
            &["OK", "Cancel"],
            Some(&field),
        );
        if let Some(h) = handler.as_ref() {
            if ok {
                let value = field.stringValue();
                h.call((Retained::as_ptr(&value) as *mut NSString,));
            } else {
                h.call((std::ptr::null_mut(),));
            }
        }
    }
}
