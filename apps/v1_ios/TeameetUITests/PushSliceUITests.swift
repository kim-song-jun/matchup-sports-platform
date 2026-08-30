import XCTest

/// The half of the push slice that only a running device can answer.
///
/// Three things here are invisible to a unit test, and each has broken silently in shells
/// like this before: whether the page can reach the bridge at all, whether the state the
/// bridge reports is the state the reader sees, and whether tapping a notification lands on
/// the thing it was about rather than the home screen.
///
/// The tests drive the deployed web app, so they need an account. Credentials come from the
/// environment and are never committed — this repository is public. Without them every test
/// skips, which is why this bundle has its own scheme and CI runs the offline one.
///
/// Run: scripts/ios/verify-push-slice.sh
@MainActor
final class PushSliceUITests: XCTestCase {

    private let app = XCUIApplication()
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    /// System alerts follow the device language, not the app's, so both labels are accepted.
    private let allowLabels = ["허용", "Allow"]

    /// The push row is a `role="switch"` button carrying `aria-label="푸시 알림 받기"`. An
    /// element with its own accessible name is a leaf, so the title and caption rendered
    /// inside it are not separate text in the accessibility tree — reading the row means
    /// reading this element, not searching for its words.
    private var pushRow: XCUIElement {
        let named = NSPredicate(format: "label ==[c] %@", "푸시 알림 받기")
        let button = webView.buttons.matching(named).firstMatch
        return button.exists ? button : webView.switches.matching(named).firstMatch
    }

    /// `aria-checked` on that switch. WebKit maps it to the element's value.
    private var isPushRowOn: Bool {
        let value = (pushRow.value as? String)?.lowercased() ?? ""
        return value == "1" || value == "on" || value == "true"
    }

    /// The row is disabled while a request is in flight, and while the OS has push blocked.
    private var isPushRowBusy: Bool { pushRow.exists && !pushRow.isEnabled }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    // MARK: - Environment

    private func environmentValue(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("""
                \(name) is not set. scripts/ios/verify-push-slice.sh passes it as an \
                xcodebuild build setting, which the scheme forwards to this process.
                """)
        }
        return value
    }

    // MARK: - Web helpers

    private var webView: XCUIElement { app.webViews.firstMatch }

    @discardableResult
    private func waitForWeb(_ timeout: TimeInterval = 60) -> XCUIElement {
        XCTAssertTrue(webView.waitForExistence(timeout: timeout), "the shell showed no web view")
        return webView
    }

    /// The tab bar is fixed along the bottom of every screen, so a row that sits under it
    /// cannot be tapped safely: XCTest resolves the row's centre, and if the page is still
    /// gliding when the tap lands, the tab bar is what receives it. Rows are kept this far
    /// clear of the bottom edge before being tapped.
    private let tabBarGuard: CGFloat = 140

    /// Taps one of the fixed tabs. No scrolling: the tab bar does not move, and it is the
    /// one control reachable from every screen, which is what makes it the recovery path.
    @discardableResult
    private func tapTab(_ label: String, timeout: TimeInterval = 30) -> Bool {
        let tab = webView.links[label]
        guard tab.waitForExistence(timeout: timeout), tab.isHittable else { return false }
        tab.tap()
        return true
    }

    /// Scrolls by about a third of the page with a controlled drag rather than a flick.
    ///
    /// `swipeUp()` keeps gliding after the gesture ends. That is what put the "계정 설정" row
    /// under the tab bar mid-tap and sent the run to the home screen instead of settings.
    private func scrollPage() {
        let start = webView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
        let end = webView.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.38))
        start.press(forDuration: 0.1, thenDragTo: end)
        settle()
    }

    /// Taps the first link or button whose accessible name starts with `name`.
    ///
    /// Prefix rather than exact match, because a settings row's accessible name is its title
    /// followed by its subtitle. Scrolling, because a row below the fold is not in the
    /// accessibility tree until it is on screen.
    @discardableResult
    private func tapRow(_ name: String, timeout: TimeInterval = 60) -> Bool {
        tapMatching(NSPredicate(format: "label BEGINSWITH %@", name), timeout: timeout)
    }

    /// Exact match, for a control whose name is a prefix of another one's — the home nudge's
    /// "알림 받기" button sits next to "알림 받기 안내 닫기", which dismisses it.
    @discardableResult
    private func tapExact(_ name: String, timeout: TimeInterval = 60) -> Bool {
        tapMatching(NSPredicate(format: "label ==[c] %@", name), timeout: timeout)
    }

    private func tapMatching(_ predicate: NSPredicate, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var lastTop: CGFloat = .greatestFiniteMagnitude
        while Date() < deadline {
            for query in [webView.buttons, webView.links, webView.switches] {
                let element = query.matching(predicate).firstMatch
                guard element.exists, element.isHittable else { continue }
                if element.frame.maxY <= webView.frame.maxY - tabBarGuard {
                    tapWhenStill(element)
                    return true
                }
            }
            let top = webView.staticTexts.firstMatch.frame.minY
            scrollPage()
            // Once the page stops moving there is nothing further down to reveal, so keep
            // waiting for the network rather than dragging at a wall.
            if abs(top - lastTop) < 1 { settle(2) }
            lastTop = top
        }
        return false
    }

    /// Taps only once the element has stopped moving.
    private func tapWhenStill(_ element: XCUIElement) {
        var previous = element.frame
        for _ in 0..<12 {
            settle(0.25)
            let current = element.frame
            if current == previous { break }
            previous = current
        }
        element.tap()
    }

    /// A short pause expressed as a query rather than a sleep, so it also gives the
    /// accessibility tree a chance to refresh.
    private func settle(_ seconds: TimeInterval = 1) {
        _ = webView.staticTexts.firstMatch.waitForExistence(timeout: seconds)
    }

    private func linkExists(_ prefix: String, timeout: TimeInterval = 0) -> Bool {
        let element = webView.links.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
        return timeout > 0 ? element.waitForExistence(timeout: timeout) : element.exists
    }

    /// Walks to the notification settings screen, checking arrival at every step.
    ///
    /// A tap that misses is not a failure on its own — it lands somewhere else in the app,
    /// and the walk starts over from the tab bar, which is present on every screen. Only
    /// running out of attempts is a failure, and the attachments then show where it ended up.
    private func openNotificationSettings(file: StaticString = #filePath, line: UInt = #line) {
        for attempt in 1...4 {
            if pushRow.exists { return }
            guard tapTab("마이"), linkExists("계정 설정", timeout: 30) else {
                attach("nav-attempt-\(attempt)-my")
                continue
            }
            guard tapRow("계정 설정"), linkExists("알림 설정", timeout: 30) else {
                attach("nav-attempt-\(attempt)-settings")
                continue
            }
            guard tapRow("알림 설정"), pushRow.waitForExistence(timeout: 30) else {
                attach("nav-attempt-\(attempt)-notifications")
                continue
            }
            return
        }
        attach("nav-gave-up")
        attachTree("nav-gave-up-tree")
        XCTFail("could not reach the notification settings screen", file: file, line: line)
    }

    private func waitForText(_ prefix: String, timeout: TimeInterval = 40) -> Bool {
        webView.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH %@", prefix))
            .firstMatch
            .waitForExistence(timeout: timeout)
    }

    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func attachTree(_ name: String) {
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name
        tree.lifetime = .keepAlways
        add(tree)
    }

    /// Signs in through the web app's own email form.
    ///
    /// This is the only way to get a session cookie into the shell's cookie store, which is
    /// the store `PushDeviceClient` reads — an injected cookie would not prove that path.
    private func signIn() throws {
        let email = try environmentValue("TEAMEET_UITEST_EMAIL")
        let password = try environmentValue("TEAMEET_UITEST_PASSWORD")

        app.launch()
        waitForWeb()

        // Signed in already, from an earlier test against the same installation.
        if webView.links["마이"].waitForExistence(timeout: 15), !webView.links["로그인하기"].exists {
            return
        }

        XCTAssertTrue(tapRow("로그인하기"), "no sign-in entry point on the landing screen")
        XCTAssertTrue(tapRow("이메일로 로그인"), "no email sign-in option")

        let emailField = webView.textFields.element(boundBy: 0)
        XCTAssertTrue(emailField.waitForExistence(timeout: 40), "the email form never appeared")
        emailField.tap()
        emailField.typeText(email)

        let passwordField = webView.secureTextFields.element(boundBy: 0)
        XCTAssertTrue(passwordField.waitForExistence(timeout: 15), "no password field")
        passwordField.tap()
        passwordField.typeText(password)

        XCTAssertTrue(tapRow("로그인"), "no submit button on the sign-in form")
        XCTAssertTrue(webView.links["마이"].waitForExistence(timeout: 90), "sign-in did not complete")
        attach("01-signed-in")
    }

    // MARK: - Tests

    /// The bridge, end to end: the page asks the shell for push state, the reader answers the
    /// OS prompt, and the row they are looking at changes to match what actually happened.
    ///
    /// This is the only place the bridge becomes observable. A shell that answers nothing
    /// looks identical in a build log; here the row simply never leaves "켜는 중이에요".
    func testALoginAndNotificationSettingsReflectNativeState() throws {
        try signIn()

        // The home nudge is the shortest path to the permission request and the least
        // fragile: a full-width button near the top of the page, well clear of the tab bar.
        // Exact match — "알림 받기 안내 닫기" sits beside it and dismisses the card.
        XCTAssertTrue(tapExact("알림 받기"), "no notification nudge on the home screen")

        // The OS prompt arriving proves `request-notification-permission` reached
        // UNUserNotificationCenter rather than being answered from a cached value.
        let alert = springboard.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 30), "the system permission prompt never appeared")
        attach("02-permission-prompt")

        let allow = allowLabels.map { alert.buttons[$0] }.first { $0.exists }
        XCTAssertNotNil(allow, "no allow button in the prompt")
        allow?.tap()

        openNotificationSettings()
        attachTree("03-settings-tree")

        // The push row only renders when the page believes a push transport exists. Inside
        // this WebView there is no service worker to fall back on, so the row's presence is
        // the shim's receipt: the page found `window.TeameetNative`.
        XCTAssertTrue(
            pushRow.exists,
            "no push row — the page did not see window.TeameetNative")
        attachTree("03-push-row")

        // The page is told the outcome through `teameet:native-push-result`. The row settling
        // at all is the first thing that must hold — a bridge that never replied would leave
        // it mid-flight until the web's own two-minute timeout.
        let settled = waitUntilPushRowSettles(timeout: 150)
        attach("04-settings-after-allow")
        attachTree("04-settings-after-allow-tree")
        XCTAssertTrue(settled, "the row stayed mid-flight — no reply reached the page")

        // Subscribed is now the expected end state: the origin stores iOS registrations, so a
        // build that reaches here with the row still off has failed somewhere in the chain —
        // no entitlement and therefore no token, a registration the server refused, or a
        // reply that never reached the page.
        //
        // The opt-out exists for an origin whose API predates the platform field, where a
        // refusal is the honest outcome and claiming otherwise would show an enabled switch
        // on a device that receives nothing.
        let expectsRefusal = ProcessInfo.processInfo.environment["TEAMEET_UITEST_EXPECT_REFUSAL"] == "1"
        if expectsRefusal {
            XCTAssertFalse(
                isPushRowOn,
                "the row claims a subscription the origin's API cannot have accepted")
        } else {
            XCTAssertTrue(
                isPushRowOn,
                "the device did not end up subscribed — check the aps-environment entitlement, "
                    + "the registration request, and the bridge reply")
        }

        // The rest of the app still works after all this — permission handling must not
        // leave the shell wedged. The settings screen carries no tab bar, so the way back is
        // the header's home link, and arriving is confirmed by the tab bar reappearing.
        XCTAssertTrue(tapRow("홈"), "the header stopped responding after the permission flow")
        XCTAssertTrue(
            linkExists("마이", timeout: 30),
            "the app stopped navigating after the permission flow")
        attach("05-app-still-usable")
    }

    /// Finds the banner SpringBoard is showing.
    ///
    /// Its identifier is not stable across iOS versions, so the text of the notification is
    /// the reliable handle: it is what the reader sees, and it is what the payload set.
    private func waitForNotificationBanner(timeout: TimeInterval) -> XCUIElement? {
        let carriesOurTitle = NSPredicate(format: "label CONTAINS %@", "문의에 답변")
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let byIdentifier = springboard.otherElements["NotificationShortLookView"]
            if byIdentifier.exists { return byIdentifier }
            let byText = springboard.descendants(matching: .any).matching(carriesOurTitle).firstMatch
            if byText.exists { return byText }
            _ = springboard.otherElements.firstMatch.waitForExistence(timeout: 2)
        }
        return nil
    }

    private func attachSpringboard(_ name: String) {
        let tree = XCTAttachment(string: springboard.debugDescription)
        tree.name = name
        tree.lifetime = .keepAlways
        add(tree)
    }

    private func waitUntilPushRowSettles(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if !isPushRowBusy { return true }
            settle(2)
        }
        return false
    }

    /// Acceptance Criteria 2: a notification about an inquiry opens that inquiry.
    ///
    /// The notification is sent from outside the process while this test waits, so what runs
    /// is the real remote path — payload, delegate, route sanitiser, shell navigation — not a
    /// locally scheduled stand-in.
    func testBNotificationTapOpensThePushedRoute() throws {
        let inquiryId = try environmentValue("TEAMEET_UITEST_INQUIRY_ID")
        let title = try environmentValue("TEAMEET_UITEST_INQUIRY_TITLE")
        try signIn()

        // Backgrounded, so the notification arrives as a banner to tap rather than as a
        // foreground presentation decision.
        XCUIDevice.shared.press(.home)

        guard let banner = waitForNotificationBanner(timeout: 180) else {
            attach("06-no-banner")
            attachSpringboard("06-no-banner-tree")
            return XCTFail("no notification banner arrived within the window")
        }
        attach("06-banner")
        banner.tap()

        // The shell should now be showing that inquiry, not the notification list.
        waitForWeb()
        let landed = waitForText(title, timeout: 90)
        attach("07-after-tap")
        attachTree("07-after-tap-tree")
        XCTAssertTrue(
            landed,
            "the tap did not land on inquiry \(inquiryId) — check DeepLinkRoute.safeRoute")
    }
}
