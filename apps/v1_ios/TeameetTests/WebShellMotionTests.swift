import XCTest

/// The shell's overlay motion has one source of truth: `WebShellModel` reads Reduce Motion
/// and asks `ShellMotionPolicy` whether to open an animation transaction and for how long.
/// If the policy drifts, a view can declare a fade while the model opens no transaction —
/// the dead `.transition` this replaced (Motion audit D7=C). The model itself imports SwiftUI
/// and UIKit, so this hostless bundle pins the Foundation-only policy it delegates to.
final class WebShellMotionTests: XCTestCase {

    func testAnimatesAtTheWebBaseDurationWhenMotionIsAllowed() {
        XCTAssertEqual(ShellMotionPolicy.transitionDuration, 0.16, "matches --duration-base 160ms")
        XCTAssertEqual(ShellMotionPolicy.animationDuration(reduceMotion: false), 0.16)
    }

    func testOpensNoTransactionWhenReduceMotionIsOn() {
        XCTAssertNil(ShellMotionPolicy.animationDuration(reduceMotion: true))
    }
}
