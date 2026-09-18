import Foundation
import SwiftUI
import UIKit

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

    /// The system "Reduce Motion" setting, kept current for the lifetime of the model.
    ///
    /// This is the shell's single source for the setting (Motion audit D7=C). The views used to
    /// read `@Environment(\.accessibilityReduceMotion)` themselves while the model — whose
    /// callers are UIKit code with no environment to read — had nothing, so the declared
    /// `.transition(.opacity)` never played: a transition only animates inside an animation
    /// transaction, and the model's state changes opened none. Now the model both owns the
    /// setting and opens the transaction, and the views ask it which transition to use.
    @Published private(set) var reduceMotion: Bool

    /// Set by the view controller so the error screen's button can reach it.
    weak var controller: WebShellViewController?

    private let isReduceMotionEnabled: () -> Bool
    // `deinit` is nonisolated and the token is not Sendable; the token is only ever written in
    // `init` and read in `deinit`, so there is no concurrent access to make unsafe.
    nonisolated(unsafe) private var reduceMotionObserver: NSObjectProtocol?

    /// `isReduceMotionEnabled` is injectable so tests can drive the setting without touching
    /// the simulator's accessibility preferences; production reads `UIAccessibility`.
    init(isReduceMotionEnabled: @escaping () -> Bool = { UIAccessibility.isReduceMotionEnabled }) {
        self.isReduceMotionEnabled = isReduceMotionEnabled
        self.reduceMotion = isReduceMotionEnabled()
        reduceMotionObserver = NotificationCenter.default.addObserver(
            forName: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // The observer closure is not isolated; hop back onto the main actor before
            // touching published state.
            Task { @MainActor [weak self] in
                self?.reduceMotion = self?.isReduceMotionEnabled() ?? false
            }
        }
    }

    deinit {
        if let observer = reduceMotionObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    /// The animation the model opens around every overlay state change: `nil` (no transaction,
    /// so the transition below resolves to an instant swap) when the reader asked for reduced
    /// motion, otherwise a short ease-out at the web app's base duration (`ShellMotionPolicy`).
    var shellTransitionAnimation: Animation? {
        ShellMotionPolicy.animationDuration(reduceMotion: reduceMotion).map { .easeOut(duration: $0) }
    }

    /// The transition the overlays declare. Kept next to the animation so the two can never
    /// disagree about reduced motion — a view that fades while the model opened no transaction
    /// is exactly the dead declaration this replaces.
    var shellTransition: AnyTransition {
        reduceMotion ? .identity : .opacity
    }

    func reportFailure(_ reason: WebShellFailureReason) {
        withAnimation(shellTransitionAnimation) {
            failure = reason
        }
    }

    func clearFailure() {
        withAnimation(shellTransitionAnimation) {
            failure = nil
        }
    }

    func retry() {
        controller?.reloadFromFailure()
    }

    /// Mirrors the two `Toast` messages `MainActivity` shows around downloads.
    func showNotice(_ message: String) {
        notice = message
    }

    func askAboutNotifications() {
        withAnimation(shellTransitionAnimation) {
            isAskingAboutNotifications = true
        }
    }

    func stopAskingAboutNotifications() {
        withAnimation(shellTransitionAnimation) {
            isAskingAboutNotifications = false
        }
    }

    func dismissNotice() {
        notice = nil
    }
}
