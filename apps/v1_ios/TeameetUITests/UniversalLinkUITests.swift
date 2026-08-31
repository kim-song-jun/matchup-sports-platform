import XCTest

/// Proves the last hop of Kakao sign-in: that tapping an `alpha.teameet.co.kr/callback/*`
/// link outside the app brings it into the app rather than leaving the reader in Safari.
///
/// This matters because `AllowedNavigation` deliberately sends the Kakao authorization pages
/// out to Safari. If the redirect back also completes there, the session is created in the
/// wrong browser and the app stays signed out — the failure is silent and looks like "login
/// didn't work".
///
/// The link has to be tapped from a **different origin**: Safari does not treat a URL typed
/// into its address bar as a universal link, and neither is a link to the page you are already
/// on. `TEAMEET_UITEST_LINK_PAGE` names a page served from somewhere else that links to the
/// callback route — see scripts/ios/verify-universal-link.sh.
///
/// Note that `xcrun simctl openurl` cannot stand in for this. It hands the URL straight to
/// Safari through CoreSimulatorBridge (`Opening URL … with com.apple.mobilesafari` in the
/// simulator log) without consulting the association at all, so it reports failure for a link
/// that works.
@MainActor
final class UniversalLinkUITests: XCTestCase {

    private static let appBundleId = "kr.co.teameet.alpha"
    private static let safariBundleId = "com.apple.mobilesafari"

    func testTappingACallbackLinkOpensTheApp() throws {
        guard let page = ProcessInfo.processInfo.environment["TEAMEET_UITEST_LINK_PAGE"],
              page.isEmpty == false else {
            throw XCTSkip("TEAMEET_UITEST_LINK_PAGE is not set; the universal link check is skipped.")
        }

        // Installed by the test run's build. Launching it once is what makes the system
        // resolve the app's associated domains — an app that has never run is not yet a
        // candidate handler.
        let app = XCUIApplication(bundleIdentifier: Self.appBundleId)
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 60), "the shell never came up")
        XCUIDevice.shared.press(.home)

        let safari = XCUIApplication(bundleIdentifier: Self.safariBundleId)
        safari.launch()
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 30), "Safari never came up")

        // Safari's address field is a text field until it is focused and a button before —
        // both shapes appear across versions, so whichever exists is used.
        // A first-run sheet covers the address bar on a fresh simulator.
        let dismiss = safari.buttons["닫기"]
        if dismiss.waitForExistence(timeout: 5) { dismiss.tap() }

        // Measured, not guessed: Safari's address field is a TextField whose identifier is
        // TabBarItemTitle. It is not called "URL" on this version, and searching for that
        // name finds nothing at all rather than failing usefully.
        let field = safari.textFields["TabBarItemTitle"]
        XCTAssertTrue(field.waitForExistence(timeout: 30), "Safari showed no address field")
        field.tap()
        safari.typeText(page + "\n")

        let link = safari.links["open-callback"]
        XCTAssertTrue(link.waitForExistence(timeout: 45), "the test page never rendered its link")
        link.tap()

        // The assertion. A universal link that resolved brings the app forward; one that did
        // not leaves Safari in front showing the web page.
        let openedInApp = app.wait(for: .runningForeground, timeout: 30)

        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = openedInApp ? "opened-in-app" : "stayed-in-safari"
        shot.lifetime = .keepAlways
        add(shot)

        XCTAssertTrue(
            openedInApp,
            "tapping the callback link stayed in Safari — Kakao sign-in would create the session there")
    }
}
