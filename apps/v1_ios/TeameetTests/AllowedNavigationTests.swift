import XCTest

// `AllowedNavigation` is compiled into this bundle directly rather than imported from the
// app module (see `project.yml`: TeameetTests lists the pure Navigation sources in its own
// `sources`). Depending on the app target instead would make every run of this suite link
// Firebase, which would tie the origin allowlist's verdicts to an unrelated SDK. The app
// target is still compiled on every CI run by the separate simulator build step.

/// Parity tests for `AllowedNavigation`.
///
/// Every case in `AllowedNavigationTest.java`
/// (`apps/v1_android/app/src/test/java/kr/co/teameet/AllowedNavigationTest.java`) appears
/// here with the same expected verdict, plus the bypass attempts the Java suite does not
/// cover. The two shells must never disagree about whether a URL is same-origin — a
/// divergence is either a hole on one platform or a broken link on the other.
///
/// `origin` is passed explicitly rather than read from `Info.plist` so these stay pure
/// logic tests: the bundle needs no host application, and therefore no Firebase.
final class AllowedNavigationTests: XCTestCase {

    private let alphaOrigin = "https://alpha.teameet.co.kr"
    private let productionOrigin = "https://teameet.co.kr"

    // MARK: - Ported from AllowedNavigationTest.allowsDownloadsOnlyFromTheExactEnvironmentOrigin

    func testAcceptsExactOriginUrls() {
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            alphaOrigin + "/api/v1/exports/report.csv?download=1", origin: alphaOrigin))
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(alphaOrigin, origin: alphaOrigin))
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(alphaOrigin + "/a#frag", origin: alphaOrigin))
    }

    func testRejectsPlaintextHttpForTheSameHost() {
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "http://alpha.teameet.co.kr/report.csv", origin: alphaOrigin))
    }

    func testRejectsHostsThatMerelyStartWithTheOrigin() {
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr.attacker.example/report.csv", origin: alphaOrigin))
    }

    func testRejectsEmbeddedCredentials() {
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://user@alpha.teameet.co.kr/report.csv", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://user:pw@alpha.teameet.co.kr/report.csv", origin: alphaOrigin))
        // `https://@host/` carries an empty—but present—user-info component, which
        // java.net.URI reports as non-null, so it is rejected the same way.
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://@alpha.teameet.co.kr/x", origin: alphaOrigin))
    }

    func testRejectsMalformedInput() {
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl("not a url", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl("", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(nil, origin: alphaOrigin))
    }

    // MARK: - Bypass attempts

    func testTreatsAnExplicitDefaultPortAsADifferentOrigin() {
        // java.net.URI reports an absent port as -1, which never equals an explicit 443.
        // Android therefore sends `:443` to the browser, and so must this shell — matching
        // it here is what keeps one platform from following a link the other refuses.
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            alphaOrigin.replacingOccurrences(of: ".kr", with: ".kr:443") + "/report.csv",
            origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr:8443/report.csv", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr:abc/x", origin: alphaOrigin))
        // An empty port (`host:`) is absent, not a default, so it stays internal.
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr:/x", origin: alphaOrigin))
    }

    func testRejectsAuthorityConfusionPayloads() {
        // The trailing authority wins, so this URL points at attacker.example.
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr@attacker.example/", origin: alphaOrigin))
        // WebKit and several other parsers read a backslash in the authority as a slash,
        // which is what makes this a real origin-confusion payload rather than a typo.
        // java.net.URI refuses the character outright; so does this port.
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr\\@attacker.example/", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/a\\b", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "//alpha.teameet.co.kr/x", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl("javascript:alert(1)", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://attacker.example/?next=https://alpha.teameet.co.kr", origin: alphaOrigin))
    }

    /// Foundation's `URL`/`URLComponents` accept every string in this test and would
    /// answer `true` for all of them. `java.net.URI` throws on each, and Android's catch
    /// turns that into a rejection. These pin the fail-closed behaviour that a
    /// `URLComponents`-based rewrite would silently drop.
    func testRejectsCharactersJavaRefusesUnescaped() {
        for candidate in [
            "https://alpha.teameet.co.kr/<inject>",
            "https://alpha.teameet.co.kr/a b",
            "https://alpha.teameet.co.kr/a\tb",
            "https://alpha.teameet.co.kr/a\u{0000}b",
            "https://alpha.teameet.co.kr/{a}",
            "https://alpha.teameet.co.kr/a|b",
            "https://alpha.teameet.co.kr/a^b",
            "https://alpha.teameet.co.kr/a\"b",
            "https://alpha.teameet.co.kr/a`b",
        ] {
            XCTAssertFalse(
                AllowedNavigation.isInternalAbsoluteUrl(candidate, origin: alphaOrigin),
                "expected \(candidate) to be rejected")
        }
    }

    /// `java.net.URI`'s `other` category excludes non-US-ASCII characters that are space
    /// characters per `Character.isSpaceChar`, so a Unicode space is refused just like an
    /// ASCII one. Rejecting only `" "` would leave this port looser than Android.
    func testRejectsNonAsciiSpaceSeparators() {
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/a\u{00A0}b", origin: alphaOrigin), "no-break space")
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/a\u{3000}b", origin: alphaOrigin), "ideographic space")
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/a\u{2028}b", origin: alphaOrigin), "line separator")
    }

    /// `java.net.URI` requires every `%` to introduce a two-hex-digit escape.
    func testRejectsMalformedPercentEscapes() {
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/x?q=100%", origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/%zz", origin: alphaOrigin))
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/x?q=%ED%92%8B%EC%82%B4", origin: alphaOrigin))
    }

    /// The strictness above must not spill onto ordinary Korean content. `java.net.URI`'s
    /// `other` category explicitly admits non-US-ASCII characters, so Android follows an
    /// unencoded Hangul link in-app; over-tightening here would send Teameet's own search
    /// and content routes out to Safari.
    func testAcceptsNonAsciiCharactersTheJavaOtherCategoryAllows() {
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/검색", origin: alphaOrigin))
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/search?q=풋살", origin: alphaOrigin))
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            "https://alpha.teameet.co.kr/x/⚽", origin: alphaOrigin))
    }

    func testComparesHostCaseInsensitively() {
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            "https://ALPHA.TEAMEET.CO.KR/x", origin: alphaOrigin))
    }

    // MARK: - Environment isolation

    /// The same assertion Android's `BuildConfigurationTest` makes from the other side:
    /// an Alpha build must not treat production as its own origin, or vice versa.
    func testKeepsAlphaAndProductionOriginsApart() {
        XCTAssertTrue(AllowedNavigation.isInternalAbsoluteUrl(
            productionOrigin + "/home", origin: productionOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            alphaOrigin + "/home", origin: productionOrigin))
        XCTAssertFalse(AllowedNavigation.isInternalAbsoluteUrl(
            productionOrigin + "/home", origin: alphaOrigin))
    }

    // MARK: - URL overload

    func testUrlOverloadMatchesTheStringOverload() {
        XCTAssertTrue(AllowedNavigation.isInternal(URL(string: alphaOrigin + "/home"), origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternal(
            URL(string: "https://attacker.example/home"), origin: alphaOrigin))
        XCTAssertFalse(AllowedNavigation.isInternal(nil, origin: alphaOrigin))
    }

    // MARK: - Trusted auth provider

    /// Every host Kakao's sign-in actually visits, not just the one it starts on. Trusting
    /// only `kauth.kakao.com` sent the reader to Safari at the login form itself.
    func testKeepsEveryKakaoAuthenticationHostInsideTheWebView() {
        for host in AllowedNavigation.trustedAuthHosts {
            XCTAssertTrue(
                AllowedNavigation.isTrustedAuthProvider("https://\(host)/oauth/authorize?x=1"),
                "expected \(host) to stay in the WebView")
            XCTAssertTrue(
                AllowedNavigation.isTrustedAuthProvider(URL(string: "https://\(host)/oauth")),
                "expected \(host) to stay in the WebView when given as a URL")
        }
        XCTAssertTrue(AllowedNavigation.isTrustedAuthProvider("https://KAUTH.KAKAO.COM/oauth"))
        XCTAssertTrue(AllowedNavigation.isTrustedAuthProvider("https://ACCOUNTS.KAKAO.COM/login"))
    }

    /// The set is closed. Anything Kakao does not serve stays out, whatever it is named.
    func testRejectsHostsOutsideTheTrustedSet() {
        for candidate in [
            "https://kakao.com/oauth",
            "https://developers.kakao.com/oauth",
            "https://accounts.google.com/o/oauth2/auth",
        ] {
            XCTAssertFalse(
                AllowedNavigation.isTrustedAuthProvider(candidate),
                "expected \(candidate) to be rejected")
        }
    }

    func testRejectsLookalikeAuthProviders() {
        for candidate in [
            "http://kauth.kakao.com/oauth",
            "https://kauth.kakao.com:443/oauth",
            "https://user@kauth.kakao.com/oauth",
            "https://evil.kauth.kakao.com/oauth",
            "https://kauth.kakao.com.attacker.example/oauth",
            // The hosts added alongside kauth need the same guarantees: a suffix match
            // would hand a third party the reader's Kakao session.
            "http://accounts.kakao.com/login",
            "https://accounts.kakao.com:443/login",
            "https://user@accounts.kakao.com/login",
            "https://evil.accounts.kakao.com/login",
            "https://accounts.kakao.com.attacker.example/login",
            "https://evil.auth.kakao.com/login",
            "https://auth.kakao.com.attacker.example/login",
            "https://kauth.kakao.com\\@attacker.example/",
        ] {
            XCTAssertFalse(
                AllowedNavigation.isTrustedAuthProvider(candidate),
                "expected \(candidate) to be rejected")
        }
        XCTAssertFalse(AllowedNavigation.isTrustedAuthProvider(nil as String?))
        XCTAssertFalse(AllowedNavigation.isTrustedAuthProvider(nil as URL?))
    }

    // MARK: - External schemes
    // Ported from AllowedNavigationTest.allowsOnlyReviewedExternalSchemes, with the two
    // platform substitutions: Android's Play-only `market:` becomes `itms-apps:`, and
    // `intent:` is dropped because iOS has no such scheme to hand off to.

    func testAllowsOnlyReviewedExternalSchemes() {
        for scheme in ["http", "https", "mailto", "tel", "sms", "geo", "itms-apps"] {
            XCTAssertTrue(AllowedNavigation.isAllowedExternalScheme(scheme), "expected \(scheme) to be allowed")
        }
        for scheme in ["HTTPS", "Tel", "ITMS-Apps"] {
            XCTAssertTrue(
                AllowedNavigation.isAllowedExternalScheme(scheme),
                "expected \(scheme) to be matched case-insensitively")
        }
    }

    func testRejectsUnreviewedAndAndroidOnlySchemes() {
        for scheme in [
            "javascript", "file", "content", "data", "about", "blob", "ftp",
            // Android-only schemes that must not survive the port as dead entries.
            "intent", "market",
        ] {
            XCTAssertFalse(
                AllowedNavigation.isAllowedExternalScheme(scheme), "expected \(scheme) to be rejected")
        }
        XCTAssertFalse(AllowedNavigation.isAllowedExternalScheme(nil))
        XCTAssertFalse(AllowedNavigation.isAllowedExternal(URL(string: "file:///etc/passwd")))
        XCTAssertTrue(AllowedNavigation.isAllowedExternal(URL(string: "mailto:help@teameet.co.kr")))
    }
}
