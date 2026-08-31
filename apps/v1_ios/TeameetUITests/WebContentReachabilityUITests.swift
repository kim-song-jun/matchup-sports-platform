import XCTest

/// Proves the one assumption everything else in this bundle rests on: that the shell's
/// `WKWebView` publishes its content to the accessibility tree, so a test can drive the
/// deployed web app the way a reader does.
@MainActor
final class WebContentReachabilityUITests: XCTestCase {

    func testTheWebViewPublishesItsContent() throws {
        // Gated on the same variable as the rest of this bundle even though it needs no
        // account. The whole bundle is the live harness: it loads the deployed web app, so a
        // CI run without credentials must be inert here too. Half a harness running in CI
        // would make the job's green depend on alpha being up, and a green that means
        // "someone else's deployment answered" is worse than no check at all.
        guard ProcessInfo.processInfo.environment["TEAMEET_UITEST_EMAIL"]?.isEmpty == false else {
            throw XCTSkip("TEAMEET_UITEST_EMAIL is not set; the live UI harness is skipped.")
        }
        let app = XCUIApplication()
        app.launch()

        let webView = app.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 60), "the shell never showed a web view")

        // Any text at all means the page's DOM is reachable. Which text it is depends on
        // where the origin sends an unauthenticated visitor, so this only asserts reachability.
        let anyText = webView.staticTexts.firstMatch
        XCTAssertTrue(anyText.waitForExistence(timeout: 60), "the page rendered nothing readable")

        let attachment = XCTAttachment(string: app.debugDescription)
        attachment.name = "element-tree"
        attachment.lifetime = .keepAlways
        add(attachment)

        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "launch"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
