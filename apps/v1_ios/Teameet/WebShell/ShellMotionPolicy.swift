import Foundation

/// How the shell's own overlays (the load-failure screen, the notification explainer) move.
///
/// Foundation-only on purpose so the hostless unit-test bundle can compile it directly
/// (see `project.yml`, `TeameetTests.sources`). `WebShellModel` turns the duration into a
/// SwiftUI `Animation`; this type decides *whether* and *how long*, which is the part worth
/// pinning with a test (Motion audit D7=C).
enum ShellMotionPolicy {

    /// Matches the web app's `--duration-base` (160ms, `apps/v1_web/src/app/tokens.css`) so a
    /// shell overlay feels like one of the page's own panels rather than a different app.
    static let transitionDuration: TimeInterval = 0.16

    /// `nil` means "open no animation transaction" — with Reduce Motion on, the overlay swaps
    /// instantly and the matching `.identity` transition keeps the views in agreement.
    static func animationDuration(reduceMotion: Bool) -> TimeInterval? {
        reduceMotion ? nil : transitionDuration
    }
}
