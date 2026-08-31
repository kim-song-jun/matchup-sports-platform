import Foundation

/// The small amount of state the shell itself owns: whether the web app failed to load, and
/// any transient message about a download.
///
/// Everything else lives in the page.
@MainActor
final class WebShellModel: ObservableObject {

    @Published private(set) var failure: WebShellFailureReason?
    @Published private(set) var notice: String?

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

    func dismissNotice() {
        notice = nil
    }
}
