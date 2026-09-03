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

    /// Set by the view controller so the error screen's button can reach it.
    weak var controller: WebShellViewController?

    /// Every published change below drives a screen swap or a slide-in explainer, and both were
    /// snapping instantly with no cross-fade or slide (Motion audit D7=A). All four call sites are
    /// UIKit code (`WebShellViewController`), not a SwiftUI `View`, so there is no `@Environment`
    /// to read `accessibilityReduceMotion` from — `UIAccessibility.isReduceMotionEnabled` is the
    /// same underlying signal (SwiftUI's environment value wraps this exact API) and is safe to
    /// read synchronously here on the main actor.
    private var reduceMotionAnimation: Animation? {
        UIAccessibility.isReduceMotionEnabled ? nil : .easeOut(duration: 0.2)
    }

    func reportFailure(_ reason: WebShellFailureReason) {
        withAnimation(reduceMotionAnimation) {
            failure = reason
        }
    }

    func clearFailure() {
        withAnimation(reduceMotionAnimation) {
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
        withAnimation(reduceMotionAnimation) {
            isAskingAboutNotifications = true
        }
    }

    func stopAskingAboutNotifications() {
        withAnimation(reduceMotionAnimation) {
            isAskingAboutNotifications = false
        }
    }

    func dismissNotice() {
        notice = nil
    }
}
