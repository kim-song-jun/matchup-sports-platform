import Foundation

/// The small amount of state the shell itself owns: whether the web app failed to load, and
/// any transient message about a download.
///
/// Everything else lives in the page.
@MainActor
final class WebShellModel: ObservableObject {

    @Published private(set) var failure: WebShellFailureReason?
    @Published private(set) var notice: String?

    /// Whether the shell's own notification explainer is on screen. Driven by the controller,
    /// which is the only thing that knows the permission status and whether a session exists.
    @Published private(set) var isAskingAboutNotifications = false

    /// Set by the view controller so the error screen's button can reach it.
    weak var controller: WebShellViewController?

    func reportFailure(_ reason: WebShellFailureReason) {
        failure = reason
    }

    func clearFailure() {
        failure = nil
    }

    func retry() {
        controller?.reloadFromFailure()
    }

    /// Mirrors the two `Toast` messages `MainActivity` shows around downloads.
    func showNotice(_ message: String) {
        notice = message
    }

    func askAboutNotifications() {
        isAskingAboutNotifications = true
    }

    func stopAskingAboutNotifications() {
        isAskingAboutNotifications = false
    }

    func dismissNotice() {
        notice = nil
    }
}
