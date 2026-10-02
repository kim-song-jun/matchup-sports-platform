import XCTest

/// The iOS counterpart of Android's `BuildConfigurationTest`, which reads `BuildConfig` for
/// whichever flavor compiled it and asserts the environment hangs together.
///
/// `TeameetTests` is given the same `Info.plist` contract as the app in `project.yml`, so
/// the bundle these tests are compiled into carries its configuration's real values. That
/// makes `testBuildCarriesAConsistentEnvironment` a genuine check on the xcconfig →
/// Info.plist pipeline rather than a check on a fixture.
final class AppConfigTests: XCTestCase {

    private var testBundleConfig: AppConfig { AppConfig(bundle: Bundle(for: AppConfigTests.self)) }

    // MARK: - Whichever configuration built this bundle

    func testBuildCarriesAConsistentEnvironment() {
        let config = testBundleConfig
        let bundleId = Bundle(for: AppConfigTests.self).bundleIdentifier ?? ""

        if bundleId.contains("alpha") {
            XCTAssertEqual(config.webOrigin, "https://alpha.teameet.co.kr")
            XCTAssertTrue(config.webViewInspectable, "Alpha exposes the page to Web Inspector")
        } else {
            XCTAssertEqual(config.webOrigin, "https://teameet.co.kr")
            XCTAssertFalse(
                config.webViewInspectable,
                "production must never be inspectable, whatever the build type")
        }
    }

    /// The `//` in the origin only survives the xcconfig parser through the `/$()/` trick.
    /// If someone writes the URL literally, the value silently truncates to `https:` — this
    /// is the assertion that catches it.
    func testOriginSurvivedTheXcconfigParser() {
        let origin = testBundleConfig.webOrigin
        XCTAssertTrue(origin.hasPrefix("https://"), "origin lost its slashes: \(origin)")
        XCTAssertTrue(origin.hasSuffix("teameet.co.kr"), "unexpected origin host: \(origin)")
        XCTAssertFalse(origin.hasSuffix("/"), "origin must not carry a trailing slash: \(origin)")
    }

    /// A route is appended to the origin verbatim, so the pair has to compose into a URL the
    /// allowlist then recognises as internal.
    func testOriginComposesIntoAnInternalUrl() {
        let config = testBundleConfig
        let url = config.url(forRoute: "/my/inquiries/inquiry-1")
        XCTAssertNotNil(url)
        XCTAssertTrue(AllowedNavigation.isInternal(url, origin: config.webOrigin))
    }

    // MARK: - Parsing

    func testReadsEveryEnvironmentKey() {
        let config = AppConfig(infoDictionary: [
            AppConfig.Key.webOrigin: "https://alpha.teameet.co.kr",
            AppConfig.Key.webViewInspectable: "YES",
        ])
        XCTAssertEqual(config.webOrigin, "https://alpha.teameet.co.kr")
        XCTAssertTrue(config.webViewInspectable)
    }

    func testTreatsAnyValueOtherThanYesAsNotInspectable() {
        for raw in ["NO", "no", "", "1", "true", "maybe"] {
            let config = AppConfig(infoDictionary: [AppConfig.Key.webViewInspectable: raw])
            XCTAssertFalse(config.webViewInspectable, "\(raw) must not enable Web Inspector")
        }
        for raw in ["YES", "yes", "Yes"] {
            let config = AppConfig(infoDictionary: [AppConfig.Key.webViewInspectable: raw])
            XCTAssertTrue(config.webViewInspectable, "\(raw) should enable Web Inspector")
        }
    }

    /// An xcconfig variable that was never substituted reaches `Info.plist` as whitespace
    /// rather than as an absent key, so values are trimmed on the way in.
    func testTrimsWhitespaceAroundValues() {
        let padded: [String: Any] = [AppConfig.Key.webOrigin: "  https://alpha.teameet.co.kr  "]
        XCTAssertEqual(AppConfig(infoDictionary: padded).webOrigin, "https://alpha.teameet.co.kr")
        XCTAssertEqual(AppConfig(infoDictionary: [:]).webOrigin, "")
    }
}
