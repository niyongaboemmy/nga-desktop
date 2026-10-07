//! How long since the person last touched the keyboard or mouse (anywhere on
//! the computer, not just NGA): auto-updates wait for an unattended PC.

use std::time::Duration;

/// None when the platform can't tell (then NGA never assumes the PC is unattended).
pub fn system_idle() -> Option<Duration> {
    imp::idle()
}

#[cfg(target_os = "macos")]
mod imp {
    use std::time::Duration;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    /// kCGEventSourceStateCombinedSessionState
    const COMBINED_SESSION: i32 = 0;
    /// kCGAnyInputEventType
    const ANY_INPUT: u32 = !0;

    pub fn idle() -> Option<Duration> {
        // SAFETY: a pure query with plain-value arguments.
        let secs = unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION, ANY_INPUT) };
        (secs.is_finite() && secs >= 0.0).then(|| Duration::from_secs_f64(secs))
    }
}

#[cfg(windows)]
mod imp {
    use std::time::Duration;
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    pub fn idle() -> Option<Duration> {
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        // SAFETY: `info` is a properly sized LASTINPUTINFO owned by this frame.
        if unsafe { GetLastInputInfo(&mut info) } == 0 {
            return None;
        }
        // Both are 32-bit tick counts; wrapping_sub survives the 49-day rollover.
        let now = unsafe { GetTickCount() };
        Some(Duration::from_millis(now.wrapping_sub(info.dwTime) as u64))
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    pub fn idle() -> Option<std::time::Duration> {
        None
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn idle_time_is_sane_where_supported() {
        if let Some(d) = super::system_idle() {
            assert!(d.as_secs() < 60 * 60 * 24 * 365);
        }
    }
}
