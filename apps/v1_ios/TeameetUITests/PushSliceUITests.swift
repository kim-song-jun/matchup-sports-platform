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
final class PushSliceUITests: LiveWebHarnessCase {

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

    /// Finds the banner SpringBoard is showing for a notification carrying `text`.
    ///
    /// Its identifier is not stable across iOS versions, so the text of the notification is
    /// the reliable handle: it is what the reader sees, and it is what the payload set. Only
    /// the text is trusted once more than one notification can be on screen — an earlier
    /// banner still showing must not count as the one being waited for.
    private func waitForNotificationBanner(containing text: String, timeout: TimeInterval) -> XCUIElement? {
        let carriesText = NSPredicate(format: "label CONTAINS %@", text)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let byText = springboard.descendants(matching: .any).matching(carriesText).firstMatch
            if byText.exists { return byText }
            _ = springboard.otherElements.firstMatch.waitForExistence(timeout: 2)
        }
        return nil
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

        guard let banner = waitForNotificationBanner(containing: "문의에 답변", timeout: 180) else {
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

    /// The real remote path, end to end: alpha's API signs a provider token, talks to Apple's
    /// sandbox gateway, and the simulator shows the banner. Everything before this in the
    /// bundle stops at the registration; `testB` proves the tap with a locally injected
    /// payload. Neither says whether the server can actually reach a device — which is the
    /// question that matters when "notifications don't arrive".
    ///
    /// The notification is sent from outside the process while this test waits (the runner
    /// calls the admin push endpoint for this account), so what runs is the deployed API's
    /// own send path. Fresh install required: the explainer only appears while the system
    /// status is `notDetermined`, and the opt-in it records is what lets the token register.
    func testEAServerSentNotificationReachesThisDevice() throws {
        let title = try environmentValue("TEAMEET_UITEST_BANNER_TITLE")
        // Read up front, like every other input: a missing value skips the whole test rather
        // than letting the terminated phase fall away silently behind a green first phase.
        let terminatedTitle = try environmentValue("TEAMEET_UITEST_TERMINATED_BANNER_TITLE")
        try signIn()

        // Opt in the way a reader does: the shell's explainer, then the system dialog.
        let explainer = app.otherElements["알림 받기 안내"]
        XCTAssertTrue(explainer.waitForExistence(timeout: 60), "the explainer never appeared")
        app.buttons["push-prompt-accept"].tap()
        let alert = springboard.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 30), "the system permission prompt never appeared")
        let allow = allowLabels.map { alert.buttons[$0] }.first { $0.exists }
        XCTAssertNotNil(allow, "no allow button in the prompt")
        allow?.tap()
        attach("12-after-allow")

        // The registration happens on the token callback; the settings row is the only place
        // its outcome is visible, and ON means the origin stored this device.
        openNotificationSettings()
        let deadline = Date().addingTimeInterval(90)
        while Date() < deadline, !isPushRowOn { settle(2) }
        attach("13-settings-after-opt-in")
        XCTAssertTrue(isPushRowOn, "the device did not register with the origin")

        // Tells the runner the device is registered, so it sends now rather than on a guess
        // about how long sign-in took. The simulator shares the host's file system.
        if let ready = ProcessInfo.processInfo.environment["TEAMEET_UITEST_READY_FILE"], !ready.isEmpty {
            FileManager.default.createFile(atPath: ready, contents: Data())
        }

        // Backgrounded, so what arrives is a banner rather than a foreground decision.
        XCUIDevice.shared.press(.home)
        let banner = waitForNotificationBanner(containing: title, timeout: 240)
        attach(banner == nil ? "14-no-banner" : "14-banner")
        attachSpringboard("14-springboard-tree")
        XCTAssertNotNil(banner, "no server-sent notification reached this device within the window")

        // Terminated, not merely backgrounded. Alert notifications are the OS's to show
        // whether or not the app is running — but "whether" is what was still unmeasured,
        // and a shell whose registration somehow depended on a live process would look fine
        // right up to here. The app is killed, the runner is told to send again under a
        // second title, and that banner has to arrive with no process of ours alive.
        app.terminate()
        if let ready = ProcessInfo.processInfo.environment["TEAMEET_UITEST_READY_FILE"], !ready.isEmpty {
            FileManager.default.createFile(atPath: ready + ".terminated", contents: Data())
        }
        let terminatedBanner = waitForNotificationBanner(containing: terminatedTitle, timeout: 240)
        attach(terminatedBanner == nil ? "15-no-banner-terminated" : "15-banner-terminated")
        XCTAssertNotNil(
            terminatedBanner,
            "no server-sent notification reached this device while the app was terminated")
    }
}
