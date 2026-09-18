import Foundation

/// Decides whether to show the shell's own notification explainer before the system dialog.
///
/// The whole point is that **iOS shows its permission dialog once.** `requestAuthorization`
/// puts it on screen only while the status is `notDetermined`; after that it returns the
/// stored answer with no UI, and a "no" can only be undone in the Settings app. Spending
/// that single ask on someone who has just opened the app and has no idea what the
/// notifications are for is how an app ends up permanently unable to notify anyone.
///
/// So the shell asks its own question first. "나중에" costs nothing — the system status is
/// still `notDetermined`, so the real dialog is still available later. Only "알림 받기"
/// spends it.
///
/// Without this the only way to be asked at all is to find 마이 → 알림 설정 and toggle the
/// switch there, which is the sole caller of the permission bridge. A reader who never goes
/// looking is never asked.
enum PushPromptPolicy {

    /// How many times a reader may say "나중에" before the shell stops asking.
    ///
    /// Bounded deliberately: an explainer that reappears forever is nagging, and someone who
    /// has declined three times has answered. The web's settings screen stays available for
    /// anyone who changes their mind, and that path is not rate limited.
    static let maximumDeferrals = 3

    /// How long to wait after a "나중에" before asking again. Grows with each deferral so the
    /// second ask is not the next launch.
    static func backoff(afterDeferrals count: Int) -> TimeInterval {
        let days = [1.0, 3.0, 7.0]
        let index = min(max(count - 1, 0), days.count - 1)
        return days[index] * 24 * 60 * 60
    }

    struct State: Equatable {
        var deferrals: Int = 0
        var lastDeferredAt: Date?
        /// Set once the reader taps 알림 받기, so the explainer is not shown again whatever
        /// the system dialog's outcome was.
        var accepted: Bool = false
    }

    /// - Parameters:
    ///   - permission: the system's current status.
    ///   - signedIn: whether the web view holds a session for the configured origin. Asking a
    ///     signed-out reader wastes the ask — there is no account to attach a token to yet,
    ///     and the notifications being described are about their own matches.
    static func shouldPrompt(
        permission: PushPermission.WebValue,
        signedIn: Bool,
        state: State,
        now: Date
    ) -> Bool {
        // Anything but notDetermined means the system dialog will not appear, so an explainer
        // in front of it would explain nothing. A reader who denied is served by the settings
        // screen's link into the Settings app instead.
        guard permission == .notDetermined else { return false }
        guard signedIn, !state.accepted else { return false }
        guard state.deferrals < maximumDeferrals else { return false }
        guard let lastDeferredAt = state.lastDeferredAt else { return true }
        return now.timeIntervalSince(lastDeferredAt) >= backoff(afterDeferrals: state.deferrals)
    }
}
