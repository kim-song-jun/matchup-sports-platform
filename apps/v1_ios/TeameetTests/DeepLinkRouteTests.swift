import XCTest

/// Parity tests for `DeepLinkRoute.safeRoute`, the sanitiser applied to the `route` a push
/// payload carries.
///
/// The three cases `AllowedNavigationTest.java` pins — a normal relative route, a
/// protocol-relative reference, and an absolute URL — appear here with the same expected
/// results, alongside the escapes that suite does not cover.
final class DeepLinkRouteTests: XCTestCase {

    // MARK: - Ported from AllowedNavigationTest.acceptsRelativeApplicationRoutes

    func testKeepsRelativeApplicationRoutes() {
        XCTAssertEqual(DeepLinkRoute.safeRoute("/my/inquiries/inquiry-1"), "/my/inquiries/inquiry-1")
        XCTAssertEqual(DeepLinkRoute.safeRoute("/tournaments/abc?tab=schedule"), "/tournaments/abc?tab=schedule")
        XCTAssertEqual(DeepLinkRoute.safeRoute("/a#frag"), "/a#frag")
        XCTAssertEqual(DeepLinkRoute.safeRoute("/"), "/")
    }

    // MARK: - Ported from AllowedNavigationTest.rejectsProtocolRelativeAndAbsoluteRoutes

    func testRejectsProtocolRelativeAndAbsoluteRoutes() {
        XCTAssertEqual(DeepLinkRoute.safeRoute("//attacker.example/path"), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute("https://attacker.example/path"), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute("///triple.example/path"), DeepLinkRoute.fallback)
    }

    // MARK: - Shapes that are not routes at all

    func testRejectsInputThatIsNotAnAbsolutePath() {
        XCTAssertEqual(DeepLinkRoute.safeRoute(nil), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute(""), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute("notifications"), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute("my/inquiries/1"), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute("javascript:alert(1)"), DeepLinkRoute.fallback)
        XCTAssertEqual(DeepLinkRoute.safeRoute("mailto:help@teameet.co.kr"), DeepLinkRoute.fallback)
    }

    /// A backslash is the interesting one: several parsers normalise `/\host` into
    /// `//host`, which would turn a route into a protocol-relative jump off the origin.
    /// `java.net.URI` refuses the character, and so does this port.
    func testRejectsRoutesCarryingCharactersJavaRefuses() {
        for candidate in [
            "/\\attacker.example/path",
            "/path with space",
            "/a\tb",
            "/a\u{0000}b",
            "/a\u{00A0}b",
            "/<script>",
            "/a|b",
            "/a^b",
            "/{a}",
            "/100%",
            "/%zz",
        ] {
            XCTAssertEqual(
                DeepLinkRoute.safeRoute(candidate), DeepLinkRoute.fallback,
                "expected \(candidate) to fall back")
        }
    }

    /// `java.net.URI` admits non-US-ASCII characters, so Android opens an unencoded Hangul
    /// route directly. Rejecting them here would send every Korean deep link to the
    /// notification list instead of the screen the push was about.
    func testKeepsNonAsciiRoutes() {
        XCTAssertEqual(DeepLinkRoute.safeRoute("/검색"), "/검색")
        XCTAssertEqual(DeepLinkRoute.safeRoute("/search?q=풋살"), "/search?q=풋살")
        XCTAssertEqual(
            DeepLinkRoute.safeRoute("/search?q=%ED%92%8B%EC%82%B4"), "/search?q=%ED%92%8B%EC%82%B4")
    }

    /// An `@` only introduces credentials inside an authority, and an authority requires
    /// the `//` this route can never have. Keeping the route is what Android does; the
    /// result still resolves inside the origin.
    func testKeepsAnAtSignThatCannotFormAnAuthority() {
        XCTAssertEqual(DeepLinkRoute.safeRoute("/@teameet"), "/@teameet")
    }

    func testFallbackIsTheNotificationList() {
        XCTAssertEqual(DeepLinkRoute.fallback, "/notifications")
    }
}
