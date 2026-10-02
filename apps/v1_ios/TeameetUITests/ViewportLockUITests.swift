import XCTest

/// Proves the page stays at 1:1 inside the shell. The case that matters is a text field
/// taking focus: WebKit zooms the page in when the field's font is under 16px, and the web
/// app's fields are 15px. A unit test cannot see that — only the rendered page can.
///
/// Measured through the accessibility frame of the field itself, which is reported in screen
/// points: a zoomed page reports a wider field. No account is needed — the sign-in form is
/// reachable signed out — but the bundle is gated on the same variable as every other live
/// test here, so a CI run without credentials stays inert.
final class ViewportLockUITests: LiveWebHarnessCase {

    func testFocusingATextFieldDoesNotZoomThePage() throws {
        _ = try environmentValue("TEAMEET_UITEST_EMAIL")
        app.launch()
        waitForWeb()

        // The same walk the sign-in harness takes to the email form: 로그인하기 sits below
        // the fold on the signed-out home, and the harness scrolls and keeps clear of the
        // tab bar on the way.
        let field = webView.textFields.element(boundBy: 0)
        if !field.waitForExistence(timeout: 5) {
            XCTAssertTrue(tapRow("로그인하기"), "no sign-in entry point on the landing screen")
            XCTAssertTrue(tapRow("이메일로 로그인"), "no email sign-in option")
        }
        XCTAssertTrue(field.waitForExistence(timeout: 40), "the email form never appeared")

        let before = still(field)
        attach("before-focus")

        field.tap()
        let after = still(field, minimumWait: 1.5)
        attach("after-focus")

        // A zoomed page scales every frame. The field is the widest thing on the form, so
        // its width is the most sensitive measure; one point covers rounding.
        XCTAssertEqual(
            after.width, before.width, accuracy: 1,
            "the page zoomed when the field took focus: \(before.width) → \(after.width)")
        XCTAssertLessThanOrEqual(after.maxX, webView.frame.maxX + 1, "the field now overflows the screen")
    }

    /// The element's frame once it has stopped moving — the keyboard sliding in and the page
    /// scrolling the field into view both move it, and neither is the zoom being measured.
    private func still(_ element: XCUIElement, minimumWait: TimeInterval = 0) -> CGRect {
        let start = Date()
        var previous = element.frame
        for _ in 0..<16 {
            settle(0.25)
            let current = element.frame
            if current == previous, Date().timeIntervalSince(start) >= minimumWait { return current }
            previous = current
        }
        return previous
    }
}
