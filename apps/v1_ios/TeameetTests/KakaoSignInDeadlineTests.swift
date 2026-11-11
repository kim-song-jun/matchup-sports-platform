import XCTest

/// The deadline fails a step whose SDK callback never comes, but only once the page is about
/// to stop waiting. Firing early would cut off a reader who is still typing in Kakao's page;
/// firing late would leave the page with a bare timeout.
@MainActor
final class KakaoSignInDeadlineTests: XCTestCase {

    private struct Expired: Error {}

    private let clock = ManualClock()
    private var expired: [String] = []

    private func makeDeadline() -> KakaoSignInDeadline {
        KakaoSignInDeadline(limit: 115, schedule: clock.schedule)
    }

    private func watch(_ deadline: KakaoSignInDeadline, _ name: String) -> KakaoSignInTimer.Cancel? {
        deadline.watch { [self] in expired.append(name) }
    }

    func testTheWatchedStepIsExpiredExactlyWhenTheLimitArrives() {
        let deadline = makeDeadline()
        _ = watch(deadline, "account")

        clock.advance(by: 114.9)
        XCTAssertEqual(expired, [], "a reader may still be typing in Kakao's page")

        clock.advance(by: 0.2)
        XCTAssertEqual(expired, ["account"])
    }

    func testAStepThatEndedBeforeTheLimitIsNeverExpired() throws {
        let deadline = makeDeadline()
        let unwatch = try XCTUnwrap(watch(deadline, "account"))

        unwatch()
        clock.advance(by: 300)

        XCTAssertEqual(expired, [])
    }

    /// The consent step starts after a login that may already have taken a minute; the page's
    /// own clock did not restart, so neither may this one.
    func testTheLimitCountsFromTheAttemptAndNotFromTheStep() throws {
        let deadline = makeDeadline()
        let unwatchAccount = try XCTUnwrap(watch(deadline, "account"))
        clock.advance(by: 100)
        unwatchAccount()
        _ = watch(deadline, "consent")

        clock.advance(by: 14.9)
        XCTAssertEqual(expired, [])

        clock.advance(by: 0.2)
        XCTAssertEqual(expired, ["consent"], "only the step waiting at that moment is expired")
    }

    func testTheLimitExpiresOnce() {
        let deadline = makeDeadline()
        _ = watch(deadline, "account")

        clock.advance(by: 115)
        clock.advance(by: 300)

        XCTAssertEqual(expired, ["account"])
    }

    /// The KakaoTalk step is not watched. If it outlasts the limit, the account page that
    /// would follow it must not open for a page that has already given up.
    func testNothingMayStartOnceTheLimitHasPassed() {
        let deadline = makeDeadline()

        clock.advance(by: 116)

        XCTAssertNil(watch(deadline, "account"))
        XCTAssertEqual(expired, [])
    }

    func testStoppingTheAttemptDisarmsTheLimit() {
        let deadline = makeDeadline()
        _ = watch(deadline, "account")

        deadline.stop()
        clock.advance(by: 300)

        XCTAssertEqual(expired, [])
    }

    /// The SDK can still answer after its step was failed; the report must stand.
    func testALateSdkAnswerAfterTheLimitDoesNotReplaceTheReport() async throws {
        let deadline = makeDeadline()
        let step = KakaoSignInStep<String>()
        _ = deadline.watch { step.deliver(.failure(Expired())) }

        clock.advance(by: 115)
        let late = step.deliver(.success("late token"))

        XCTAssertFalse(late)
        do {
            _ = try await step.wait()
            XCTFail("the step should have failed at the limit")
        } catch is Expired {
        }
    }
}
