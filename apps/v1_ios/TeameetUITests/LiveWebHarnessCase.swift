import XCTest

/// What every live test in this bundle needs to drive the deployed web app the way a reader
/// does: the running app, SpringBoard for system dialogs and banners, the web view and the
/// ways of reaching into it, the sign-in walk, and the attachments that show where a run
/// ended up. Test classes subclass this; it declares no tests of its own.
///
/// The tests talk to the deployed origin, so they need an account. Credentials come from the
/// environment and are never committed — this repository is public. Without them every test
/// skips, which is why the bundle has its own scheme and CI runs the offline one.
@MainActor
class LiveWebHarnessCase: XCTestCase {

    let app = XCUIApplication()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    /// System alerts follow the device language, not the app's, so both labels are accepted.
    let allowLabels = ["허용", "Allow"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    // MARK: - Environment

    func environmentValue(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("""
                \(name) is not set. The runners under scripts/ios/ (verify-push-slice.sh, \
                verify-push-delivery.sh) pass it as an xcodebuild build setting, which the \
                scheme forwards to this process.
                """)
        }
        return value
    }

    // MARK: - Web helpers

    var webView: XCUIElement { app.webViews.firstMatch }

    @discardableResult
    func waitForWeb(_ timeout: TimeInterval = 60) -> XCUIElement {
        XCTAssertTrue(webView.waitForExistence(timeout: timeout), "the shell showed no web view")
        // A web view with no text in it is still loading. On a freshly erased simulator the
        // first document takes long enough that a walk starting here taps nothing and then
        // throws asking for the frame of text that is not there — measured twice.
        XCTAssertTrue(
            webView.staticTexts.firstMatch.waitForExistence(timeout: timeout),
            "the page rendered nothing readable")
        return webView
    }

    /// The tab bar is fixed along the bottom of every screen, so a row that sits under it
    /// cannot be tapped safely: XCTest resolves the row's centre, and if the page is still
    /// gliding when the tap lands, the tab bar is what receives it. Rows are kept this far
    /// clear of the bottom edge before being tapped.
    let tabBarGuard: CGFloat = 140

    /// Taps one of the fixed tabs. No scrolling: the tab bar does not move, and it is the
    /// one control reachable from every screen, which is what makes it the recovery path.
    @discardableResult
    func tapTab(_ label: String, timeout: TimeInterval = 30) -> Bool {
        let tab = webView.links[label]
        guard tab.waitForExistence(timeout: timeout), tab.isHittable else { return false }
        tab.tap()
        return true
    }

    /// Scrolls by about a third of the page with a controlled drag rather than a flick.
    ///
    /// `swipeUp()` keeps gliding after the gesture ends. That is what put the "계정 설정" row
    /// under the tab bar mid-tap and sent the run to the home screen instead of settings.
    func scrollPage() {
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
    func tapRow(_ name: String, timeout: TimeInterval = 60) -> Bool {
        tapMatching(NSPredicate(format: "label BEGINSWITH %@", name), timeout: timeout)
    }

    func tapMatching(_ predicate: NSPredicate, timeout: TimeInterval) -> Bool {
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
            // `frame` throws on an element that does not exist; a page mid-navigation can
            // have no text at all for a moment.
            let firstText = webView.staticTexts.firstMatch
            let top = firstText.exists ? firstText.frame.minY : .greatestFiniteMagnitude
            scrollPage()
            // Once the page stops moving there is nothing further down to reveal, so keep
            // waiting for the network rather than dragging at a wall.
            if abs(top - lastTop) < 1 { settle(2) }
            lastTop = top
        }
        return false
    }

    /// Taps only once the element has stopped moving.
    func tapWhenStill(_ element: XCUIElement) {
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
    func settle(_ seconds: TimeInterval = 1) {
        _ = webView.staticTexts.firstMatch.waitForExistence(timeout: seconds)
    }

    func linkExists(_ prefix: String, timeout: TimeInterval = 0) -> Bool {
        let element = webView.links.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
        return timeout > 0 ? element.waitForExistence(timeout: timeout) : element.exists
    }

    func waitForText(_ prefix: String, timeout: TimeInterval = 40) -> Bool {
        webView.staticTexts
            .matching(NSPredicate(format: "label BEGINSWITH %@", prefix))
            .firstMatch
            .waitForExistence(timeout: timeout)
    }

    func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func attachTree(_ name: String) {
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name
        tree.lifetime = .keepAlways
        add(tree)
    }

    /// Signs in through the web app's own email form.
    ///
    /// This is the only way to get a session cookie into the shell's cookie store, which is
    /// the store `PushDeviceClient` reads — an injected cookie would not prove that path.
    func signIn() throws {
        let email = try environmentValue("TEAMEET_UITEST_EMAIL")
        let password = try environmentValue("TEAMEET_UITEST_PASSWORD")

        app.launch()
        waitForWeb()

        // Signed in already, from an earlier test against the same installation.
        if webView.links["마이"].waitForExistence(timeout: 15), !webView.links["로그인하기"].exists {
            return
        }

        // Bounded retry. On a freshly erased simulator the first tap on the page is taken
        // but goes nowhere — the home screen stays put and the walk then scrolls it looking
        // for an option that only exists on the sign-in screen. Measured twice on first
        // launch; the same walk went through on the very next launch.
        var reachedSignIn = false
        for attempt in 1...3 {
            XCTAssertTrue(tapRow("로그인하기"), "no sign-in entry point on the landing screen")
            if linkExists("이메일로 로그인", timeout: 20) { reachedSignIn = true; break }
            attach("sign-in-entry-attempt-\(attempt)")
        }
        XCTAssertTrue(reachedSignIn, "로그인하기 never opened the sign-in options")
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

    /// Dismisses the shell's own notification explainer if it is on screen.
    ///
    /// It appears over the page shortly after sign-in and swallows taps meant for the app, so
    /// any test that is not about the explainer itself has to get it out of the way first —
    /// measured: a chat-room walk that never left the home screen because every tap landed on
    /// the overlay. `나중에` is used rather than `알림 받기` because it must not spend the one
    /// system permission dialog iOS allows.
    @discardableResult
    func dismissNotificationExplainerIfPresent(timeout: TimeInterval = 20) -> Bool {
        let explainer = app.otherElements["알림 받기 안내"]
        guard explainer.waitForExistence(timeout: timeout) else { return false }
        app.buttons["push-prompt-defer"].tap()
        _ = explainer.waitForNonExistence(timeout: 10)
        return true
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
    func focus(_ field: XCUIElement, attempts: Int = 4) -> Bool {
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
    func hasKeyboardFocus(_ field: XCUIElement) -> Bool {
        (field.value(forKey: "hasKeyboardFocus") as? Bool) ?? false
    }

    func attachSpringboard(_ name: String) {
        let tree = XCTAttachment(string: springboard.debugDescription)
        tree.name = name
        tree.lifetime = .keepAlways
        add(tree)
    }
}
