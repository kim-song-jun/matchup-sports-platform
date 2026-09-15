import Foundation

/// Remembers what the reader answered to the shell's own notification explainer.
///
/// Deliberately separate from `PushCoordinator`'s opt-in flag: that one records what the
/// reader chose about push, this one records how many times they have been *asked*. They
/// diverge on the case that matters — someone who tapped 나중에 has not opted out, they have
/// not answered yet.
struct PushPromptStore {

    private enum Key {
        static let deferrals = "teameet.push.prompt.deferrals"
        static let lastDeferredAt = "teameet.push.prompt.lastDeferredAt"
        static let accepted = "teameet.push.prompt.accepted"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var state: PushPromptPolicy.State {
        let seconds = defaults.double(forKey: Key.lastDeferredAt)
        return PushPromptPolicy.State(
            deferrals: defaults.integer(forKey: Key.deferrals),
            // A zero here is "never deferred", not 1970: `double(forKey:)` returns 0 for a
            // key that was never written.
            lastDeferredAt: seconds > 0 ? Date(timeIntervalSince1970: seconds) : nil,
            accepted: defaults.bool(forKey: Key.accepted))
    }

    func recordDeferral(at date: Date = Date()) {
        defaults.set(defaults.integer(forKey: Key.deferrals) + 1, forKey: Key.deferrals)
        defaults.set(date.timeIntervalSince1970, forKey: Key.lastDeferredAt)
    }

    /// Recorded when the reader taps 알림 받기, whatever the system dialog then returns.
    /// Asking twice would only be useful if the dialog could appear twice, and it cannot.
    func recordAccepted() {
        defaults.set(true, forKey: Key.accepted)
    }
}
