import Foundation

/// Decides when a KakaoTalk handoff the reader walked away from is over.
///
/// The SDK completes a KakaoTalk login only when KakaoTalk redirects back. A reader who returns
/// without that redirect (swipes back, closes KakaoTalk) would leave the attempt pending
/// forever, so the attempt is abandoned when the app returns from the background and no
/// redirect arrives within `grace`.
@MainActor
final class KakaoSignInHandoffWatch {

    typealias Cancel = @MainActor () -> Void
    typealias Schedule = @MainActor (_ delay: TimeInterval, _ fire: @escaping @MainActor () -> Void) -> Cancel

    /// The redirect and the return to the foreground are delivered separately and in no
    /// guaranteed order, so a redirect may follow the activation by a moment.
    static let defaultGrace: TimeInterval = 2

    static let mainActorSchedule: Schedule = { delay, fire in
        let task = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            fire()
        }
        return { task.cancel() }
    }

    private let grace: TimeInterval
    private let schedule: Schedule
    private let onAbandoned: @MainActor () -> Void

    private var wentToBackground = false
    private var redirected = false
    private var finished = false
    private var cancelTimer: Cancel?

    init(
        grace: TimeInterval = KakaoSignInHandoffWatch.defaultGrace,
        schedule: @escaping Schedule = KakaoSignInHandoffWatch.mainActorSchedule,
        onAbandoned: @escaping @MainActor () -> Void
    ) {
        self.grace = grace
        self.schedule = schedule
        self.onAbandoned = onAbandoned
    }

    /// Leaving for KakaoTalk, or any other trip out of the app.
    func appDidEnterBackground() {
        guard !finished else { return }
        wentToBackground = true
        clearTimer()
    }

    /// Only a return that followed a real background trip counts: Control Center or a banner
    /// deactivates the app without ever backgrounding it.
    func appDidBecomeActive() {
        guard !finished, wentToBackground, !redirected, cancelTimer == nil else { return }
        cancelTimer = schedule(grace) { [weak self] in self?.graceElapsed() }
    }

    /// KakaoTalk came back with a redirect; the SDK's completion now takes over.
    func redirectReceived() {
        guard !finished else { return }
        redirected = true
        clearTimer()
    }

    /// The attempt ended some other way; nothing here may fire afterwards.
    func stop() {
        finished = true
        clearTimer()
    }

    private func graceElapsed() {
        cancelTimer = nil
        guard !finished, !redirected else { return }
        finished = true
        onAbandoned()
    }

    private func clearTimer() {
        cancelTimer?()
        cancelTimer = nil
    }
}
