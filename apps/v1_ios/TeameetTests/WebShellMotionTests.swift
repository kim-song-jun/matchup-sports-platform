import SwiftUI
import XCTest

@testable import Teameet

/// The shell's overlay motion has one source of truth: the model reads Reduce Motion, opens
/// the animation transaction, and hands the views the matching transition. If these fail, a
/// view can declare a fade while the model opens no transaction — the dead `.transition`
/// this replaced (Motion audit D7=C).
@MainActor
final class WebShellMotionTests: XCTestCase {

    func testAnimatesAtTheWebBaseDurationWhenMotionIsAllowed() {
        let model = WebShellModel(isReduceMotionEnabled: { false })

        XCTAssertFalse(model.reduceMotion)
        XCTAssertEqual(WebShellModel.shellTransitionDuration, 0.16, "matches --duration-base 160ms")
        XCTAssertEqual(
            model.shellTransitionAnimation,
            .easeOut(duration: WebShellModel.shellTransitionDuration))
    }

    func testOpensNoTransactionWhenReduceMotionIsOn() {
        let model = WebShellModel(isReduceMotionEnabled: { true })

        XCTAssertTrue(model.reduceMotion)
        XCTAssertNil(model.shellTransitionAnimation)
    }

    /// The setting can change while the app is open; the model must follow the system
    /// notification rather than freeze the value it read at launch.
    func testFollowsTheSystemNotification() {
        var enabled = false
        let model = WebShellModel(isReduceMotionEnabled: { enabled })
        XCTAssertFalse(model.reduceMotion)

        enabled = true
        NotificationCenter.default.post(
            name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)

        let updated = expectation(description: "reduceMotion follows the notification")
        Task { @MainActor in
            // The observer hops to the main actor in its own task; give it one turn.
            await Task.yield()
            XCTAssertTrue(model.reduceMotion)
            XCTAssertNil(model.shellTransitionAnimation)
            updated.fulfill()
        }
        wait(for: [updated], timeout: 1)
    }
}
