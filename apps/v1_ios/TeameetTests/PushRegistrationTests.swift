import XCTest

/// The device token as the API stores it.
///
/// Two classic ways to get this wrong, both of which register a token that can never
/// receive anything and neither of which fails loudly:
///  - `Data.description`, which on current iOS yields `{length = 32, bytes = 0x...}`
///  - `String(format: "%x", byte)`, which drops the leading zero so `0x0a` becomes `"a"`
///    and every zero-prefixed byte shortens the token by one character
final class PushDeviceRegistrationTests: XCTestCase {

    private let installationId = UUID(uuidString: "0e65978c-3a58-42e5-a371-cf6d6239699a")!

    func testEncodesEveryByteAsTwoHexDigits() {
        // Deliberately leading-zero bytes: 0x00, 0x0a, 0x0f.
        let token = Data([0x00, 0x0a, 0x0f, 0xff, 0x10, 0xab])
        XCTAssertEqual(PushDeviceRegistration.hexString(from: token), "000a0fff10ab")
    }

    func testProducesTheLengthApnsTokensHave() {
        let token = Data((0..<32).map { UInt8($0) })
        let hex = PushDeviceRegistration.hexString(from: token)
        // 32 bytes → 64 hex characters. A shortened token is the symptom of the %x bug.
        XCTAssertEqual(hex.count, 64)
        XCTAssertTrue(hex.allSatisfy { $0.isHexDigit })
        XCTAssertTrue(hex.hasPrefix("000102030405"))
    }

    func testNeverUsesTheDataDescription() {
        let hex = PushDeviceRegistration.hexString(from: Data([0xde, 0xad, 0xbe, 0xef]))
        XCTAssertEqual(hex, "deadbeef")
        XCTAssertFalse(hex.contains("length"))
        XCTAssertFalse(hex.contains("<"))
        XCTAssertFalse(hex.contains(" "))
    }

    func testEncodesAnEmptyTokenAsAnEmptyString() {
        XCTAssertEqual(PushDeviceRegistration.hexString(from: Data()), "")
    }

    // MARK: - Request body

    func testSendsTheThreeFieldsTheApiRequires() throws {
        let registration = PushDeviceRegistration(
            installationId: installationId,
            deviceToken: Data(repeating: 0xab, count: 32),
            appVersion: "0.1.0",
            deviceModel: "iPhone")
        let body = try XCTUnwrap(registration.jsonBody())
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any])

        XCTAssertEqual(json["installationId"] as? String, installationId.uuidString)
        XCTAssertEqual(json["token"] as? String, String(repeating: "ab", count: 32))
        // Required by the API, not defaulted — a registration without it is refused, which
        // is what stops an APNs token from being stored as an Android one.
        XCTAssertEqual(json["platform"] as? String, "ios")
        XCTAssertEqual(json["appVersion"] as? String, "0.1.0")
        XCTAssertEqual(json["deviceModel"] as? String, "iPhone")
    }

    func testOmitsOptionalMetadataRatherThanSendingEmptyStrings() throws {
        let registration = PushDeviceRegistration(
            installationId: installationId,
            deviceToken: Data(repeating: 0x01, count: 32),
            appVersion: "",
            deviceModel: nil)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: XCTUnwrap(registration.jsonBody())) as? [String: Any])
        XCTAssertNil(json["appVersion"])
        XCTAssertNil(json["deviceModel"])
    }

    /// A device model is user-visible text that ends up in a JSON body. Building the body
    /// by hand would let a quote in it break the request.
    func testEscapesMetadataThatWouldBreakTheJson() throws {
        let hostile = #"iPhone","platform":"android"#
        let registration = PushDeviceRegistration(
            installationId: installationId,
            deviceToken: Data(repeating: 0x01, count: 32),
            appVersion: nil,
            deviceModel: hostile)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: XCTUnwrap(registration.jsonBody())) as? [String: Any])
        XCTAssertEqual(json["deviceModel"] as? String, hostile)
        XCTAssertEqual(json["platform"] as? String, "ios", "the platform must not be overridable")
    }

    // MARK: - Sendability guard

    /// The DTO requires at least 20 characters. Catching a stub token here keeps a pointless
    /// authenticated request off the wire and stops the retry loop treating a client-side
    /// mistake as a server problem.
    func testRefusesToSendAnImplausibleToken() {
        let short = PushDeviceRegistration(
            installationId: installationId, deviceToken: Data([0x01]),
            appVersion: nil, deviceModel: nil)
        XCTAssertFalse(short.isSendable)

        let empty = PushDeviceRegistration(
            installationId: installationId, deviceToken: Data(),
            appVersion: nil, deviceModel: nil)
        XCTAssertFalse(empty.isSendable)

        let real = PushDeviceRegistration(
            installationId: installationId, deviceToken: Data(repeating: 0x7f, count: 32),
            appVersion: nil, deviceModel: nil)
        XCTAssertTrue(real.isSendable)
    }
}

/// What a tap opens. Acceptance Criteria 2 lives here: an inquiry reply must land on that
/// inquiry, not on the notification list.
final class PushNotificationPayloadTests: XCTestCase {

    func testOpensTheRouteTheServerSent() {
        let payload = PushNotificationPayload(userInfo: [
            "aps": ["alert": ["title": "문의 답변이 등록되었습니다"]],
            "route": "/my/inquiries/inquiry-1",
            "notificationId": "notification-1",
        ])
        XCTAssertEqual(payload.route, "/my/inquiries/inquiry-1")
        XCTAssertEqual(payload.notificationId, "notification-1")
    }

    /// A payload with no usable route still opens something. Dropping the tap would be
    /// worse than landing on the list, and Android makes the same choice.
    func testFallsBackToTheNotificationListRatherThanDroppingTheTap() {
        for userInfo in [
            ["aps": [:]] as [AnyHashable: Any],
            ["aps": [:], "route": ""],
            ["aps": [:], "route": 42],
        ] {
            XCTAssertEqual(PushNotificationPayload(userInfo: userInfo).route, "/notifications")
        }
    }

    /// The route arrives from the server and is concatenated onto the origin, so it goes
    /// through the same sanitiser a deep link does.
    func testRefusesARouteThatWouldSteerTheShellOffOrigin() {
        for hostile in [
            "https://attacker.example/steal",
            "//attacker.example/steal",
            "/path with space",
            "/\\attacker.example",
        ] {
            let payload = PushNotificationPayload(userInfo: ["aps": [:], "route": hostile])
            XCTAssertEqual(payload.route, "/notifications", "\(hostile) must not be opened")
        }
    }

    func testTreatsAMissingNotificationIdAsAbsent() {
        XCTAssertNil(PushNotificationPayload(userInfo: ["aps": [:]]).notificationId)
        XCTAssertNil(
            PushNotificationPayload(userInfo: ["aps": [:], "notificationId": ""]).notificationId)
    }

    func testRecognisesOurOwnNotifications() {
        XCTAssertTrue(PushNotificationPayload.isTeameetNotification(["aps": [:]]))
        XCTAssertFalse(PushNotificationPayload.isTeameetNotification(["route": "/home"]))
    }
}

/// Which cookies may leave the web view for our API.
///
/// The store also holds cookies from the Kakao authorization page the shell loads in place,
/// so the filter is the only thing keeping a third party's cookie off our own endpoint.
final class PushCookieScopeTests: XCTestCase {

    private let host = "alpha.teameet.co.kr"

    func testAcceptsAHostOnlyCookie() {
        XCTAssertTrue(PushCookieScope.matches(domain: host, host: host))
        XCTAssertTrue(PushCookieScope.matches(domain: "ALPHA.TEAMEET.CO.KR", host: host))
    }

    /// A dot-prefixed domain covers subdomains, so a cookie set on the parent is ours.
    func testAcceptsADotPrefixedParentDomain() {
        XCTAssertTrue(PushCookieScope.matches(domain: ".teameet.co.kr", host: host))
        XCTAssertTrue(PushCookieScope.matches(domain: ".alpha.teameet.co.kr", host: host))
    }

    /// The case a plain suffix comparison gets wrong: the match has to land on a label
    /// boundary, or `evilalpha.teameet.co.kr` would look like a parent of our host.
    func testRejectsADomainThatOnlyLooksLikeAParent() {
        XCTAssertFalse(PushCookieScope.matches(domain: "teameet.co.kr", host: host),
                       "a host-only cookie for the parent is not ours")
        XCTAssertFalse(PushCookieScope.matches(domain: ".evilteameet.co.kr", host: host))
        XCTAssertFalse(PushCookieScope.matches(domain: "evilalpha.teameet.co.kr", host: host))
    }

    func testRejectsForeignDomains() {
        XCTAssertFalse(PushCookieScope.matches(domain: "kauth.kakao.com", host: host))
        XCTAssertFalse(PushCookieScope.matches(domain: ".kakao.com", host: host))
        XCTAssertFalse(PushCookieScope.matches(domain: "teameet.co.kr", host: host))
    }

    func testRejectsEmptyInput() {
        XCTAssertFalse(PushCookieScope.matches(domain: "", host: host))
        XCTAssertFalse(PushCookieScope.matches(domain: ".", host: host))
        XCTAssertFalse(PushCookieScope.matches(domain: host, host: ""))
    }
}
