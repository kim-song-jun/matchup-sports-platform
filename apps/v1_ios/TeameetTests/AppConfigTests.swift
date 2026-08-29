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
            AppConfig.Key.firebaseProjectId: "teameet-alpha",
            AppConfig.Key.firebaseAppId: "1:816070948845:ios:abc123",
            AppConfig.Key.firebaseApiKey: "AIzaSyDummyKeyForUnitTestsOnly1234567",
            AppConfig.Key.firebaseSenderId: "816070948845",
        ])
        XCTAssertEqual(config.webOrigin, "https://alpha.teameet.co.kr")
        XCTAssertTrue(config.webViewInspectable)
        XCTAssertEqual(config.firebaseProjectId, "teameet-alpha")
        XCTAssertTrue(config.isFirebaseConfigured)
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

    /// Android's `FirebaseBootstrap.initialize()` returns false when any of the four public
    /// identifiers is blank, leaving push off rather than crashing. A build with no Firebase
    /// values injected has to behave the same way here.
    func testFirebaseIsUnconfiguredWhenAnyIdentifierIsMissing() {
        let complete: [String: Any] = [
            AppConfig.Key.firebaseProjectId: "teameet-alpha",
            AppConfig.Key.firebaseAppId: "1:816070948845:ios:abc123",
            AppConfig.Key.firebaseApiKey: "AIzaSyDummyKeyForUnitTestsOnly1234567",
            AppConfig.Key.firebaseSenderId: "816070948845",
        ]
        XCTAssertTrue(AppConfig(infoDictionary: complete).isFirebaseConfigured)

        for missing in complete.keys {
            var partial = complete
            partial[missing] = ""
            XCTAssertFalse(
                AppConfig(infoDictionary: partial).isFirebaseConfigured,
                "blank \(missing) must leave Firebase unconfigured")
        }
        XCTAssertFalse(AppConfig(infoDictionary: [:]).isFirebaseConfigured)
    }

    /// Unsubstituted placeholders and stray whitespace both reach `Info.plist` when an
    /// xcconfig variable is missing, and neither should read as a configured value.
    func testTreatsWhitespaceOnlyValuesAsAbsent() {
        var padded: [String: Any] = [
            AppConfig.Key.firebaseProjectId: "  ",
            AppConfig.Key.firebaseAppId: "\n",
            AppConfig.Key.firebaseApiKey: "\t",
            AppConfig.Key.firebaseSenderId: " ",
        ]
        XCTAssertFalse(AppConfig(infoDictionary: padded).isFirebaseConfigured)

        padded[AppConfig.Key.webOrigin] = "  https://alpha.teameet.co.kr  "
        XCTAssertEqual(AppConfig(infoDictionary: padded).webOrigin, "https://alpha.teameet.co.kr")
    }
}
