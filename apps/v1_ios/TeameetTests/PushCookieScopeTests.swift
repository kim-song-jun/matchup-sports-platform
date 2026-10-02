import XCTest

/// Signed-in detection, which is a different question from "is this cookie ours".
final class PushSessionDetectionTests: XCTestCase {

    private let host = "alpha.teameet.co.kr"

    func testASessionCookieForOurHostMeansSignedIn() {
        XCTAssertTrue(PushCookieScope.hasSession(
            cookies: [(name: "teameet_v1_session", domain: host)], host: host))
    }

    /// The defect this replaced: the origin sets cookies for a signed-out visitor too, and
    /// treating any of them as a session showed the notification explainer to someone who had
    /// not signed in.
    func testOtherCookiesForOurHostDoNotMeanSignedIn() {
        XCTAssertFalse(PushCookieScope.hasSession(
            cookies: [(name: "consent", domain: host), (name: "_ga", domain: host)], host: host))
    }

    func testASessionCookieForAnotherHostDoesNotCount() {
        XCTAssertFalse(PushCookieScope.hasSession(
            cookies: [(name: "teameet_v1_session", domain: "evilalpha.teameet.co.kr")], host: host))
    }
}
