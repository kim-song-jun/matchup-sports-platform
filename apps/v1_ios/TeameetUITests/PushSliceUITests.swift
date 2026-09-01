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
        XCTAssertTrue(focus(emailField), "the email field never took keyboard focus")
        emailField.typeText(email)

        let passwordField = webView.secureTextFields.element(boundBy: 0)
        XCTAssertTrue(passwordField.waitForExistence(timeout: 15), "no password field")
        // Tab out of the email field rather than tapping the password one. Tapping it does
        // not move focus here — measured: four attempts over sixteen seconds and
        // `hasKeyboardFocus` stayed false — while the browser's own next-field behaviour
        // does, because it is the page moving focus rather than a synthesised hit test.
        //
        // `typeKey` rather than `typeText("\t")`: the text form inserts a literal tab into
        // the email instead of moving focus, and the sign-in then fails much later with
        // "did not complete" — the corrupted address is invisible from that message.
        if !hasKeyboardFocus(passwordField) {
            emailField.typeKey(XCUIKeyboardKey.tab, modifierFlags: [])
        }
        // The address must be exactly what was typed. A stray tab here is why an earlier run
        // reached the submit button and still failed to sign in.
        XCTAssertEqual(emailField.value as? String, email, "the email field holds something else")
        XCTAssertTrue(focus(passwordField), "the password field never took keyboard focus")
        passwordField.typeText(password)

        XCTAssertTrue(tapRow("로그인"), "no submit button on the sign-in form")
        XCTAssertTrue(webView.links["마이"].waitForExistence(timeout: 90), "sign-in did not complete")
        attach("01-signed-in")
    }

    /// Taps a field and waits until that field actually holds keyboard focus.
    ///
    /// A bare `tap()` followed by `typeText` fails intermittently with "Neither element nor
    /// any descendant has keyboard focus": the tap is dispatched, but on a web form the field
    /// can still be settling — the previous field's keyboard is dismissing, or the page has
    /// not finished laying out — so the keystrokes arrive before focus does.
    ///
    /// Waiting for `app.keyboards` is not enough, and looked like it worked: a simulator with
    /// a hardware keyboard attached reports a keyboards element the whole time, so the wait
    /// returned immediately and the same failure came back at the same line. The element's own
    /// `hasKeyboardFocus` is the thing that was actually false, so that is what is polled.
    @discardableResult
    private func focus(_ field: XCUIElement, attempts: Int = 4) -> Bool {
        for attempt in 0..<attempts {
            if hasKeyboardFocus(field) { return true }
            // An element tap resolves to the element's own hit point, which a web input can
            // report while the previous field's keyboard still owns focus. A coordinate tap
            // goes to the same place by a different route and lands when the element tap does
            // not, so the two are alternated rather than one being repeated.
            if attempt % 2 == 0 {
                field.tap()
            } else {
                field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
            let deadline = Date().addingTimeInterval(4)
            while Date() < deadline {
                if hasKeyboardFocus(field) { return true }
                settle(0.5)
            }
        }
        return false
    }

    /// Exposed through KVC rather than the public API, which has no equivalent.
    private func hasKeyboardFocus(_ field: XCUIElement) -> Bool {
        (field.value(forKey: "hasKeyboardFocus") as? Bool) ?? false
    }

    // MARK: - Tests

    /// The bridge, end to end: the page asks the shell for push state, the reader answers the
    /// OS prompt, and the row they are looking at changes to match what actually happened.
    ///
    /// This is the only place the bridge becomes observable. A shell that answers nothing
    /// looks identical in a build log; here the row simply never leaves "켜는 중이에요".
    func testALoginAndNotificationSettingsReflectNativeState() throws {
        try signIn()

        // Enabled from the settings screen, not the home nudge. That nudge is account-scoped:
        // once the account has push on any device it stops appearing, so on a second device
        // it is simply absent — which is also why the row itself says other devices have to
        // be turned on separately. The settings row is on every device, always.
        openNotificationSettings()
        attachTree("02-settings-tree")

        // The push row only renders when the page believes a push transport exists. Inside
        // this WebView there is no service worker to fall back on, so the row's presence is
        // the shim's receipt: the page found `window.TeameetNative`.
        XCTAssertTrue(
            pushRow.exists,
            "no push row — the page did not see window.TeameetNative")
        XCTAssertFalse(isPushRowOn, "a freshly installed device should start unsubscribed")
        attachTree("02-push-row")

        XCTAssertTrue(tapRow("푸시 알림 받기"), "no push row available to tap")

        // The OS prompt arriving proves `request-notification-permission` reached
        // UNUserNotificationCenter rather than being answered from a cached value.
        let alert = springboard.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 30), "the system permission prompt never appeared")
        attach("03-permission-prompt")

        let allow = allowLabels.map { alert.buttons[$0] }.first { $0.exists }
        XCTAssertNotNil(allow, "no allow button in the prompt")
        allow?.tap()

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

    /// The shell's own explainer, which exists because iOS asks once and the web only asks
    /// from a settings screen a reader has to go looking for.
    ///
    /// Must run on a fresh install: the thing under test only appears while the system status
    /// is `notDetermined`, and any earlier test that answered the system dialog removes it.
    func testCTheShellAsksAboutNotificationsOnceSignedIn() throws {
        _ = try environmentValue("TEAMEET_UITEST_EMAIL")
        app.launch()
        waitForWeb()

        // Negative control. Asking a signed-out reader would spend the one system dialog on
        // someone with no account to attach a token to — if this fails the policy is not
        // being consulted at all, and the rest of the test would pass for the wrong reason.
        let explainer = app.otherElements["알림 받기 안내"]
        XCTAssertFalse(
            explainer.waitForExistence(timeout: 8),
            "the explainer appeared before sign-in")

        try signIn()

        XCTAssertTrue(
            explainer.waitForExistence(timeout: 60),
            "signing in did not bring up the notification explainer")
        attach("08-explainer")

        // 나중에 must not spend the system dialog. That is the entire reason the explainer
        // exists, so it is asserted rather than assumed.
        app.buttons["push-prompt-defer"].tap()
        XCTAssertFalse(
            explainer.waitForExistence(timeout: 5),
            "declining left the explainer on screen")
        let systemAlert = springboard.alerts.firstMatch
        XCTAssertFalse(
            systemAlert.waitForExistence(timeout: 8),
            "declining the explainer still showed the system permission dialog")
        attach("09-after-defer")

        // And it does not come straight back on the next page, or it would be nagging.
        app.terminate()
        app.launch()
        waitForWeb()
        XCTAssertFalse(
            explainer.waitForExistence(timeout: 20),
            "the explainer reappeared immediately after 나중에")
        attach("10-not-nagging")
    }

    /// 알림 받기 must dismiss the explainer and hand over to the system dialog.
    ///
    /// Asserted separately from the decline path because they go through different code, and
    /// a reader reported the explainer staying on screen after tapping it. Fresh install
    /// required: the explainer only appears while the system status is `notDetermined`.
    func testDAcceptingTheExplainerDismissesItAndAsksTheSystem() throws {
        _ = try environmentValue("TEAMEET_UITEST_EMAIL")
        app.launch()
        waitForWeb()
        try signIn()

        let explainer = app.otherElements["알림 받기 안내"]
        XCTAssertTrue(
            explainer.waitForExistence(timeout: 60), "the explainer never appeared")
        app.buttons["push-prompt-accept"].tap()

        // The reported bug: the explainer stayed up after the tap.
        XCTAssertFalse(
            explainer.waitForExistence(timeout: 8),
            "the explainer stayed on screen after 알림 받기")
        attach("11-after-accept")

        // And the tap is only worth anything if it spends the system dialog it was gating.
        XCTAssertTrue(
            springboard.alerts.firstMatch.waitForExistence(timeout: 20),
            "accepting did not bring up the system permission dialog")
        attachSpringboard("11-system-dialog-tree")
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
