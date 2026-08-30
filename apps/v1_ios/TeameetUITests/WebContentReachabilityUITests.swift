import XCTest

/// Proves the one assumption everything else in this bundle rests on: that the shell's
/// `WKWebView` publishes its content to the accessibility tree, so a test can drive the
/// deployed web app the way a reader does.
@MainActor
final class WebContentReachabilityUITests: XCTestCase {

    func testTheWebViewPublishesItsContent() {
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
