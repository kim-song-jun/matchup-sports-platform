import XCTest

/// What the keyboard does to a screen whose input sits at the bottom of the frame.
///
/// The chat composer is that screen. Reported from a real iPhone: opening the keyboard threw
/// the whole room out of place — the header and half the messages scrolled away and the
/// composer came to rest in the middle of the screen with a band of empty page under it,
/// hundreds of points above the keyboard it was supposed to sit on.
///
/// Only a rendered page with a real keyboard shows this, which is why it lives here. The
/// measurement is the gap between the composer and the keyboard: on a correct layout the
/// composer rests on the keyboard, and the number is small.
final class KeyboardLayoutUITests: LiveWebHarnessCase {

    /// How far the composer may sit above the keyboard before it counts as adrift. Generous
    /// on purpose: a safe-area strip or a home indicator may legitimately separate them, and
    /// the failure being caught is measured in hundreds of points, not tens.
    private let maximumGapPoints: CGFloat = 80

    func testOpeningTheKeyboardKeepsTheChatComposerOnTheKeyboard() throws {
        _ = try environmentValue("TEAMEET_UITEST_EMAIL")
        try signIn()
        dismissNotificationExplainerIfPresent()
        openFirstChatRoom()

        let composer = webView.textFields.element(boundBy: 0)
        XCTAssertTrue(composer.waitForExistence(timeout: 30), "the chat room showed no composer")
        let before = composer.frame
        attach("chat-01-before-focus")

        XCTAssertTrue(focus(composer), "the composer never took keyboard focus")
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 20), "the keyboard never appeared")
        settle(2)

        let after = composer.frame
        attach("chat-02-after-focus")
        attachTree("chat-02-after-focus-tree")

        // Measured against the top of the keyboard *area*, not the keys: the form accessory
        // bar above them belongs to the keyboard as far as the reader is concerned, and it is
        // what the composer has to rest on. `app.keyboards` reports the keys alone, which
        // would leave a ~100pt toolbar counted as if it were empty page.
        let toolbar = app.toolbars.firstMatch
        let keyboardTop = min(
            keyboard.frame.minY,
            toolbar.exists ? toolbar.frame.minY : .greatestFiniteMagnitude)

        // The composer must end up ON the keyboard, not adrift above it. A page that scrolls
        // itself out from under the keyboard leaves exactly this gap.
        let gap = keyboardTop - after.maxY
        XCTAssertLessThan(
            gap, maximumGapPoints,
            "the composer is \(gap)pt above the keyboard — the page scrolled out from under it")
        // A negative gap is the opposite failure and just as bad: the keyboard covering the
        // composer would pass a one-sided check while leaving the reader unable to type.
        XCTAssertGreaterThanOrEqual(
            gap, -1, "the keyboard is covering the composer by \(-gap)pt")

        // The composer rising is correct — the viewport shrank under it. What must not happen
        // is the page sliding out from under the keyboard, and the header is the tell: in the
        // reported failure it had scrolled off the top along with half the conversation.
        XCTAssertLessThan(after.minY, before.minY, "the viewport did not shrink under the keyboard")
        let back = webView.links.matching(NSPredicate(format: "label BEGINSWITH %@", "뒤로가기")).firstMatch
        XCTAssertTrue(back.exists, "the room header scrolled away when the keyboard opened")
        XCTAssertGreaterThanOrEqual(back.frame.minY, webView.frame.minY - 1, "the header scrolled above the web view")
    }

    /// Home → the chat button in the corner → the first room in the list.
    ///
    /// A tap that misses lands somewhere else in the app rather than failing, so the walk
    /// restarts from the tab bar, which is present on every screen. Only running out of
    /// attempts is a failure, and the attachments then show where it ended up.
    private func openFirstChatRoom(file: StaticString = #filePath, line: UInt = #line) {
        for attempt in 1...3 {
            if webView.textFields.element(boundBy: 0).exists { return }
            guard tapTab("홈"), tapChatFloatingButton(), tapFirstChatRoomRow() else {
                attach("chat-nav-attempt-\(attempt)")
                continue
            }
            if webView.textFields.element(boundBy: 0).waitForExistence(timeout: 30) { return }
            attach("chat-nav-attempt-\(attempt)-room")
        }
        attach("chat-nav-gave-up")
        attachTree("chat-nav-gave-up-tree")
        XCTFail("could not reach a chat room", file: file, line: line)
    }

    /// Taps the floating chat button in the corner of the home screen.
    ///
    /// Not `tapRow`, which keeps every target clear of the tab bar before tapping: this
    /// button lives inside that band on purpose and would be skipped forever. It is pinned,
    /// so no scrolling is needed to reach it.
    private func tapChatFloatingButton(timeout: TimeInterval = 30) -> Bool {
        let fab = webView.links.matching(NSPredicate(format: "label ==[c] %@", "채팅")).firstMatch
        guard fab.waitForExistence(timeout: timeout), fab.isHittable else { return false }
        fab.tap()
        return true
    }

    /// Taps the first row of the chat list.
    ///
    /// The room's name is account data this test must not hard-code, so the first link below
    /// the filter chips is taken instead — that is the first room whatever it is called.
    private func tapFirstChatRoomRow() -> Bool {
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            let row = webView.links.allElementsBoundByIndex.first {
                $0.exists && $0.isHittable
                    && $0.frame.minY > webView.frame.minY + 160
                    && $0.frame.maxY < webView.frame.maxY - tabBarGuard
            }
            if let row {
                tapWhenStill(row)
                return true
            }
            settle(1)
        }
        return false
    }
}
