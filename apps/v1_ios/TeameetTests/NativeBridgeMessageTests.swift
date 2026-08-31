import XCTest
import UserNotifications

/// Pins the wire format `apps/v1_web/src/lib/native-push.ts` already speaks.
///
/// The web is not modified for iOS, so every name and shape here is fixed by the web's
/// existing code rather than chosen: the global, the four action strings, the event name,
/// and the three `detail` fields. A change on this side is a break on that side.
final class NativeBridgeMessageTests: XCTestCase {

    private func message(_ json: String) -> NativeBridge.Message? {
        NativeBridge.parse(json)
    }

    // MARK: - Names the web depends on

    func testUsesTheNamesTheWebLooksFor() {
        // `isNativePushAvailable()` checks `window.TeameetNative?.postMessage`.
        XCTAssertEqual(NativeBridge.handlerName, "TeameetNative")
        // `requestNativePush` listens for this event.
        XCTAssertEqual(NativeBridge.resultEventName, "teameet:native-push-result")
    }

    /// The four strings in the web's `NativePushAction` union.
    func testSupportsExactlyTheFourDeclaredActions() {
        XCTAssertEqual(
            Set(NativeBridge.Action.allCases.map(\.rawValue)),
            ["get-push-state",
             "request-notification-permission",
             "open-notification-settings",
             "revoke-push-device"])
    }

    // MARK: - Parsing

    func testParsesEveryDeclaredAction() {
        for action in NativeBridge.Action.allCases {
            let parsed = message(#"{"type":"\#(action.rawValue)","requestId":"abc-123"}"#)
            XCTAssertEqual(parsed?.action, action)
            XCTAssertEqual(parsed?.requestId, "abc-123")
        }
    }

    /// A page that sends nonsense must be ignored. Answering would resolve a promise nobody
    /// made, and answering an action the shell does not implement would report a state it
    /// never looked at.
    func testIgnoresInputThatIsNotAWellFormedRequest() {
        for raw in [
            "",
            "not json",
            "{",
            "[]",
            "null",
            #"{"requestId":"abc"}"#,                        // no type
            #"{"type":"","requestId":"abc"}"#,              // empty type
            #"{"type":"delete-everything","requestId":"a"}"#, // unknown action
            #"{"type":123,"requestId":"abc"}"#,             // wrong type for type
            #"{"type":["get-push-state"]}"#,
        ] {
            XCTAssertNil(NativeBridge.parse(raw), "expected \(raw) to be ignored")
        }
        XCTAssertNil(NativeBridge.parse(nil))
        // WKScriptMessage.body is Any; a non-string body is not our contract.
        XCTAssertNil(NativeBridge.parse(42))
        XCTAssertNil(NativeBridge.parse(["type": "get-push-state"]))
    }

    /// Android answers a missing requestId with an empty string rather than dropping the
    /// request, so the action still runs. The web ignores the resulting event, which is the
    /// same outcome on both platforms.
    func testStillActsOnARequestWithNoRequestId() {
        let parsed = message(#"{"type":"get-push-state"}"#)
        XCTAssertEqual(parsed?.action, .getPushState)
        XCTAssertEqual(parsed?.requestId, "")
    }

    func testIgnoresUnknownExtraFields() {
        let parsed = message(#"{"type":"get-push-state","requestId":"x","extra":{"a":1}}"#)
        XCTAssertEqual(parsed?.action, .getPushState)
        XCTAssertEqual(parsed?.requestId, "x")
    }

    // MARK: - Result script

    func testBuildsAnEventCarryingTheThreeFieldsTheWebReads() throws {
        let script = NativeBridge.resultScript(
            requestId: "abc-123", permission: "granted", subscribed: true)
        XCTAssertTrue(script.hasPrefix(
            "window.dispatchEvent(new CustomEvent('teameet:native-push-result',{detail:"))
        let detail = try XCTUnwrap(detailObject(from: script))
        XCTAssertEqual(detail["requestId"] as? String, "abc-123")
        XCTAssertEqual(detail["permission"] as? String, "granted")
        XCTAssertEqual(detail["subscribed"] as? Bool, true)
    }

    /// `requestId` comes from the page. Interpolating it into a script literal would let a
    /// quote in it close the string and continue as code, so it is serialised instead.
    func testEscapesARequestIdThatWouldOtherwiseBreakOutOfTheScript() throws {
        let hostile = #"a'"});alert(1);//"#
        let script = NativeBridge.resultScript(
            requestId: hostile, permission: "denied", subscribed: false)
        XCTAssertFalse(script.contains("alert(1);//\""), "the payload must not survive as code")
        let detail = try XCTUnwrap(detailObject(from: script))
        XCTAssertEqual(detail["requestId"] as? String, hostile)
    }

    func testRoundTripsANonAsciiRequestId() throws {
        let script = NativeBridge.resultScript(
            requestId: "요청-1", permission: "default", subscribed: false)
        let detail = try XCTUnwrap(detailObject(from: script))
        XCTAssertEqual(detail["requestId"] as? String, "요청-1")
    }

    private func detailObject(from script: String) -> [String: Any]? {
        guard let start = script.range(of: "{detail:"),
              let end = script.range(of: "})", options: .backwards) else { return nil }
        let json = String(script[start.upperBound..<end.lowerBound])
        guard let data = json.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    // MARK: - Shim

    /// The shim exists so the web needs no iOS-specific branch: Android installs
    /// `TeameetNative` through `addWebMessageListener`, and this reproduces the same global
    /// on top of `window.webkit.messageHandlers`.
    func testShimInstallsTheGlobalTheWebChecksFor() {
        let shim = NativeBridge.shimScript
        XCTAssertTrue(shim.contains("window.webkit"))
        XCTAssertTrue(shim.contains("messageHandlers"))
        XCTAssertTrue(shim.contains("TeameetNative"))
        XCTAssertTrue(shim.contains("postMessage"))
        // Frozen and non-writable so page code cannot swap in its own bridge and have the
        // shell answer it.
        XCTAssertTrue(shim.contains("Object.freeze"))
        XCTAssertTrue(shim.contains("writable: false"))
        XCTAssertTrue(shim.contains("configurable: false"))
    }

    /// Injected into every document, including ones where WebKit installed no handler. It
    /// must not throw there, or it would break the page it was meant to serve.
    func testShimBailsOutWhenNoHandlerIsPresent() {
        XCTAssertTrue(NativeBridge.shimScript.contains("if (!handlers"))
    }

    // MARK: - Permission mapping
    // Fixed by the web's NotificationPermission type. Real push registration does not change
    // any of it, which is why it is pinned before that lands.

    func testMapsAuthorizationStatusOntoTheWebsThreeValues() {
        XCTAssertEqual(PushPermission.webValue(for: .notDetermined), .notDetermined)
        XCTAssertEqual(PushPermission.webValue(for: .notDetermined).rawValue, "default")
        XCTAssertEqual(PushPermission.webValue(for: .denied), .denied)
        XCTAssertEqual(PushPermission.webValue(for: .denied).rawValue, "denied")
        for status: UNAuthorizationStatus in [.authorized, .provisional, .ephemeral] {
            XCTAssertEqual(
                PushPermission.webValue(for: status), .granted,
                "\(status) delivers notifications, so the web must see it as granted")
            XCTAssertTrue(PushPermission.isGranted(status))
        }
        XCTAssertFalse(PushPermission.isGranted(.notDetermined))
        XCTAssertFalse(PushPermission.isGranted(.denied))
    }
}

/// Direct port of `PushDeliveryPolicyTest.java`, including its four-combination table.
final class PushConsentTests: XCTestCase {

    func testDisplaysOnlyWhenPermissionAndUserOptInAreBothPresent() {
        XCTAssertTrue(PushConsent.shouldDisplay(permissionGranted: true, optedIn: true))
        XCTAssertFalse(PushConsent.shouldDisplay(permissionGranted: false, optedIn: true))
        XCTAssertFalse(PushConsent.shouldDisplay(permissionGranted: true, optedIn: false))
        XCTAssertFalse(PushConsent.shouldDisplay(permissionGranted: false, optedIn: false))
    }

    func testKeepsRegistrationOnlyWithActiveConsent() {
        XCTAssertTrue(PushConsent.hasActiveConsent(permissionGranted: true, optedIn: true))
        XCTAssertFalse(PushConsent.hasActiveConsent(permissionGranted: false, optedIn: true))
        XCTAssertFalse(PushConsent.hasActiveConsent(permissionGranted: true, optedIn: false))
        XCTAssertFalse(PushConsent.hasActiveConsent(permissionGranted: false, optedIn: false))
    }
}

/// Pins the origin rule that decides which frames may drive the bridge.
///
/// The message handler lives on the content controller, so every frame in the web view can
/// reach `window.webkit.messageHandlers.TeameetNative` — including the Kakao authorization
/// page the shell deliberately loads in place, and any third-party iframe a page embeds.
/// This rule is the only thing between those frames and the reader's notification state.
final class NativeBridgeOriginTests: XCTestCase {

    private let origin = "https://alpha.teameet.co.kr"

    private func matches(_ scheme: String, _ host: String, _ port: Int) -> Bool {
        NativeBridge.matchesOrigin(
            scheme: scheme, host: host, port: port, expectedOrigin: origin)
    }

    func testAcceptsTheConfiguredOrigin() {
        XCTAssertTrue(matches("https", "alpha.teameet.co.kr", 0))
        XCTAssertTrue(matches("HTTPS", "ALPHA.TEAMEET.CO.KR", 0))
    }

    /// The one third-party origin the shell loads in place. It must still not be able to ask
    /// the shell anything.
    func testRejectsTheTrustedAuthProviderItLoadsInPlace() {
        XCTAssertFalse(matches("https", "kauth.kakao.com", 0))
    }

    func testRejectsEveryOtherOrigin() {
        XCTAssertFalse(matches("http", "alpha.teameet.co.kr", 0), "plaintext")
        XCTAssertFalse(matches("https", "teameet.co.kr", 0), "the other environment")
        XCTAssertFalse(matches("https", "alpha.teameet.co.kr.attacker.example", 0), "suffix host")
        XCTAssertFalse(matches("https", "attacker.example", 0))
        XCTAssertFalse(matches("https", "", 0), "an opaque origin reports an empty host")
        XCTAssertFalse(matches("", "", 0), "about:blank in a sandboxed frame")
        // WKSecurityOrigin reports 0 for an absent port, so an explicit 443 is a different
        // origin — the same line AllowedNavigation draws.
        XCTAssertFalse(matches("https", "alpha.teameet.co.kr", 443))
        XCTAssertFalse(matches("https", "alpha.teameet.co.kr", 8443))
    }

    func testRejectsEverythingWhenTheConfiguredOriginIsUnusable() {
        for broken in [
            "",
            "https:",                                  // what the xcconfig parser leaves behind
            "//alpha.teameet.co.kr",                   // scheme lost
            "http://alpha.teameet.co.kr",              // plaintext
            "not a url",
            "https://user@alpha.teameet.co.kr",        // credentials in the configured origin
        ] {
            XCTAssertFalse(
                NativeBridge.matchesOrigin(
                    scheme: "https", host: "alpha.teameet.co.kr", port: 0, expectedOrigin: broken),
                "a build with origin \(broken) must trust nothing")
        }
    }
}
