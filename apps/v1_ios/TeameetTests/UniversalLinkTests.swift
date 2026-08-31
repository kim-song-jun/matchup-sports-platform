import XCTest

/// Which links the shell agrees to render itself.
///
/// The stakes are the session cookie: anything this returns a route for is loaded into the
/// web view that holds it. Anything it declines goes to Safari instead, which is a fine
/// outcome for a page that is not ours.
final class UniversalLinkTests: XCTestCase {

    private let origin = "https://alpha.teameet.co.kr"

    private func route(_ text: String, origin: String? = nil) -> String? {
        guard let url = URL(string: text) else { return nil }
        return UniversalLink.route(for: url, origin: origin ?? self.origin)
    }

    // MARK: - What it opens

    func testOpensTheKakaoCallbackItExistsFor() {
        XCTAssertEqual(
            route("https://alpha.teameet.co.kr/callback/kakao?code=abc&state=xyz"),
            "/callback/kakao?code=abc&state=xyz",
            "the query carries the authorization code; dropping it would break sign-in")
    }

    func testKeepsTheFragment() {
        XCTAssertEqual(
            route("https://alpha.teameet.co.kr/my/inquiries/1#reply"),
            "/my/inquiries/1#reply")
    }

    func testTreatsABareOriginAsTheRoot() {
        XCTAssertEqual(route("https://alpha.teameet.co.kr"), "/")
        XCTAssertEqual(route("https://alpha.teameet.co.kr/"), "/")
    }

    func testMatchesTheHostCaseInsensitively() {
        XCTAssertEqual(route("https://ALPHA.Teameet.CO.KR/home"), "/home")
    }

    // MARK: - What it declines

    /// The case the whole type exists to get right. A build pointed at alpha must not render
    /// production, and neither must render a look-alike host.
    func testDeclinesAnotherHost() {
        XCTAssertNil(route("https://teameet.co.kr/home"))
        XCTAssertNil(route("https://evilalpha.teameet.co.kr/home"))
        XCTAssertNil(route("https://alpha.teameet.co.kr.attacker.example/home"))
    }

    func testDeclinesPlainHttp() {
        XCTAssertNil(route("http://alpha.teameet.co.kr/home"))
    }

    /// `https://alpha.teameet.co.kr@attacker.example/` reads as our host to a human and
    /// resolves to the attacker's to a parser.
    func testDeclinesEmbeddedCredentials() {
        XCTAssertNil(route("https://alpha.teameet.co.kr@attacker.example/home"))
        XCTAssertNil(route("https://user:pass@alpha.teameet.co.kr/home"))
    }

    func testDeclinesAnExplicitPortTheOriginDoesNotHave() {
        XCTAssertNil(route("https://alpha.teameet.co.kr:8443/home"))
    }

    /// A mangled configuration must make the shell trust nothing rather than fall back to
    /// matching on host alone — the xcconfig parser truncates a literal `//`.
    func testDeclinesEverythingWhenTheConfiguredOriginIsBroken() {
        for broken in ["", "https:", "//alpha.teameet.co.kr", "http://alpha.teameet.co.kr"] {
            XCTAssertNil(
                route("https://alpha.teameet.co.kr/home", origin: broken),
                "a build configured with '\(broken)' must open nothing")
        }
    }

    /// A path the push sanitiser would refuse is refused here too, so a link cannot reach a
    /// destination a notification could not.
    func testDeclinesAPathTheRouteSanitiserRejects() {
        XCTAssertNil(route("https://alpha.teameet.co.kr/path with space"))
    }

    /// …but a link that genuinely points at the notification list is still opened, rather
    /// than being mistaken for a rejection.
    func testOpensTheNotificationListItself() {
        XCTAssertEqual(route("https://alpha.teameet.co.kr/notifications"), "/notifications")
    }
}
