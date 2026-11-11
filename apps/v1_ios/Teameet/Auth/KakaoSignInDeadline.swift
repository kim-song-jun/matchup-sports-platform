import Foundation

/// Ends a sign-in attempt just before the page stops waiting for it.
///
/// The page gives up on the shell's answer after 120 s (`RESPONSE_TIMEOUT_MS` in
/// `apps/v1_web/src/lib/native-kakao.ts`) and then knows nothing about why. A step whose SDK
/// callback never comes would hold the attempt until then, so the watched step is failed first
/// and its report reaches the page.
///
/// The SDK does not say whether its page is on screen, so a dropped callback cannot be told
/// from a reader still typing; nothing may fire earlier than the page's own limit allows.
/// The clock is one timer for the whole attempt, not one per step: a step that begins late
/// only gets what is left of the page's patience.
@MainActor
final class KakaoSignInDeadline {

    /// Mirrors the page's `RESPONSE_TIMEOUT_MS`.
    static let pageTimeout: TimeInterval = 120
    /// What the report needs to reach the page before it stops listening.
    static let replyMargin: TimeInterval = 5
    static let defaultLimit = pageTimeout - replyMargin

    private var cancelTimer: KakaoSignInTimer.Cancel?
    private var expired = false
    private var onExpired: (@MainActor () -> Void)?

    init(
        limit: TimeInterval = KakaoSignInDeadline.defaultLimit,
        schedule: KakaoSignInTimer.Schedule = KakaoSignInTimer.mainActor
    ) {
        cancelTimer = schedule(limit) { [weak self] in self?.expire() }
    }

    /// Registers the one step now waiting on the SDK; `onExpired` runs if the deadline arrives
    /// while it is still registered. Returns nil when the deadline has already passed, in which
    /// case the step must not start: the page no longer waits for what it would open.
    func watch(_ onExpired: @escaping @MainActor () -> Void) -> KakaoSignInTimer.Cancel? {
        guard !expired else { return nil }
        self.onExpired = onExpired
        return { [weak self] in self?.onExpired = nil }
    }

    /// The attempt ended some other way; nothing here may fire afterwards.
    func stop() {
        cancelTimer?()
        cancelTimer = nil
        onExpired = nil
    }

    private func expire() {
        cancelTimer = nil
        expired = true
        let handler = onExpired
        onExpired = nil
        handler?()
    }
}
