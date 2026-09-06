import XCTest

/// Captures the screens that go on the App Store listing.
///
/// Not a test in the usual sense — it asserts only that it reached each screen, and its real
/// output is the attachments. It lives in the UI bundle because that is the only place a
/// screenshot of the running app can be taken at device scale, which is what App Store
/// Connect's size requirement is about: on an iPhone 16 Pro Max the screen is exactly the
/// 1320×2868 the store accepts for 6.9", so the frames need no scaling and lose nothing.
///
/// Run through `scripts/ios/capture-store-screenshots.sh`, which picks the right simulator,
/// exports the attachments and checks them for the alpha channel App Store Connect refuses.
final class StoreScreenshotUITests: LiveWebHarnessCase {

    /// Taps a tab, retrying while the previous screen is still settling.
    ///
    /// `tapTab` answers "not hittable" without retrying, which is right for a walk that can
    /// start over from the tab bar — this one cannot, so it waits instead. Measured: the tap
    /// right after a capture landed while the page was still transitioning.
    private func openTab(_ label: String) -> Bool {
        for _ in 0..<6 {
            // The shell's notification explainer can come up on a later page load, after the
            // one dismissal at sign-in, and it swallows every tap while it is there —
            // measured: the walk captured the home screen and then never left it.
            dismissNotificationExplainerIfPresent(timeout: 1)
            if tapBottomNav(label) { return true }
            settle(2)
        }
        attachTree("store-nav-gave-up-\(label)-tree")
        return false
    }

    /// Taps the tab bar entry, chosen by position rather than by name alone.
    ///
    /// `webView.links[label]` resolves to a single element, and a home screen that also has a
    /// card or heading with the same word makes that query ambiguous — it then reports the
    /// tab as absent, which is how the walk stalled on 홈 forever. The bar is pinned to the
    /// bottom, so the lowest match is the tab whatever else the page happens to call things.
    private func tapBottomNav(_ label: String) -> Bool {
        let named = NSPredicate(format: "label ==[c] %@", label)
        let candidates = webView.links.matching(named).allElementsBoundByIndex
            .filter { $0.exists && $0.isHittable }
        guard let tab = candidates.max(by: { $0.frame.minY < $1.frame.minY }) else { return false }
        tab.tap()
        return true
    }

    /// Named so the export script can order them; the store shows them in the order uploaded.
    /// The `store-` prefix is what separates these from the harness's own debug attachments.
    private func capture(_ name: String) {
        settle(2)
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testCapturesTheListingScreens() throws {
        _ = try environmentValue("TEAMEET_UITEST_EMAIL")
        try signIn()
        dismissNotificationExplainerIfPresent()

        // The tab bar is on every screen, so the walk cannot get lost: a tap that misses
        // leaves us somewhere else in the app and the next tap starts from the same bar.
        for (tab, name) in [("홈", "store-01-home"), ("매치", "store-02-matches"), ("대회", "store-03-tournaments"), ("팀", "store-04-teams"), ("마이", "store-05-my")] {
            XCTAssertTrue(openTab(tab), "could not reach the \(tab) tab")
            capture(name)
        }
    }
}
