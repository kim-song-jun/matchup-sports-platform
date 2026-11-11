import XCTest

/// The KakaoTalk handoff has no completion of its own when the reader comes back without
/// KakaoTalk's redirect. These cases pin when that counts as "gave up" and, as important, when
/// it must not: a false positive cancels a sign-in that was about to succeed.
@MainActor
final class KakaoSignInHandoffWatchTests: XCTestCase {

    private let clock = ManualClock()
    private var abandoned = 0

    private func makeWatch() -> KakaoSignInHandoffWatch {
        KakaoSignInHandoffWatch(grace: 2, schedule: clock.schedule) { [self] in abandoned += 1 }
    }

    /// Swiping back from KakaoTalk: the app returns and no redirect ever arrives.
    func testAbandonsOnlyAfterTheGracePeriodWhenTheAppReturnsWithoutARedirect() {
        let watch = makeWatch()

        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        clock.advance(by: 1.9)
        XCTAssertEqual(abandoned, 0, "the redirect may still be on its way")

        clock.advance(by: 0.2)
        XCTAssertEqual(abandoned, 1)
    }

    func testARedirectBeforeActivationNeverAbandons() {
        let watch = makeWatch()

        watch.appDidEnterBackground()
        watch.redirectReceived()
        watch.appDidBecomeActive()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 0)
    }

    func testARedirectShortlyAfterActivationNeverAbandons() {
        let watch = makeWatch()

        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        clock.advance(by: 1.5)
        watch.redirectReceived()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 0)
    }

    /// Control Center or a notification banner deactivates the app without backgrounding it.
    func testBecomingActiveWithoutHavingBeenInTheBackgroundNeverAbandons() {
        let watch = makeWatch()

        watch.appDidBecomeActive()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 0)
    }

    func testALateRedirectAfterAbandoningDoesNotAbandonAgain() {
        let watch = makeWatch()
        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        clock.advance(by: 3)
        XCTAssertEqual(abandoned, 1)

        watch.redirectReceived()
        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 1)
    }

    /// Back in the app for a moment, then off to KakaoTalk again: still waiting, not gave up.
    func testLeavingAgainWithinTheGraceRestartsTheWait() {
        let watch = makeWatch()
        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        clock.advance(by: 1)

        watch.appDidEnterBackground()
        clock.advance(by: 60)
        XCTAssertEqual(abandoned, 0, "away again; nothing to give up on yet")

        watch.appDidBecomeActive()
        clock.advance(by: 1.9)
        XCTAssertEqual(abandoned, 0, "the grace period starts over")
        clock.advance(by: 0.2)
        XCTAssertEqual(abandoned, 1)
    }

    func testRepeatedActivationsAbandonOnce() {
        let watch = makeWatch()

        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        watch.appDidBecomeActive()
        watch.appDidBecomeActive()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 1)
    }

    /// The attempt can end for its own reasons while the grace timer runs.
    func testStoppingDisarmsAPendingGracePeriod() {
        let watch = makeWatch()
        watch.appDidEnterBackground()
        watch.appDidBecomeActive()

        watch.stop()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 0)
    }

    func testEventsAfterStoppingAreIgnored() {
        let watch = makeWatch()
        watch.stop()

        watch.appDidEnterBackground()
        watch.appDidBecomeActive()
        clock.advance(by: 60)

        XCTAssertEqual(abandoned, 0)
    }
}
