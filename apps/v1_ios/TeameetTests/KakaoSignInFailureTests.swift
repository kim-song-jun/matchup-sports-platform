import XCTest

/// What the page logs when native Kakao sign-in fails. The reader never sees it, so the only
/// way it helps is by saying which step failed and why — without leaking what the SDK echoes.
final class KakaoSignInFailureTests: XCTestCase {

    private func failure(
        _ step: KakaoSignInFailure.Step = .talk, family: String = "ClientFailed",
        reason: String = "NotSupported", detail: String? = nil
    ) -> KakaoSignInFailure {
        KakaoSignInFailure(step: step, family: family, reason: reason, detail: detail)
    }

    // MARK: - Report shape

    /// A Talk failure followed by an account failure must show both, classification first.
    func testReportNamesEveryFailedStepBeforeAnyDetail() {
        let report = KakaoSignInFailure.report([
            failure(.talk, reason: "NotSupported", detail: "KakaoTalk launch failed."),
            failure(.account, reason: "Unknown", detail: "An error occurred on executing authentication session."),
        ])

        XCTAssertTrue(
            report.hasPrefix("talk:ClientFailed/NotSupported account:ClientFailed/Unknown"), report)
        XCTAssertTrue(report.contains("talk: KakaoTalk launch failed."), report)
        XCTAssertTrue(report.contains("account: An error occurred on executing authentication session."), report)
    }

    func testReportOfAStepWithoutDetailHasNoDanglingSeparator() {
        let report = KakaoSignInFailure.report([failure(.consent, family: "Other", reason: "MissingAccessToken")])

        XCTAssertEqual(report, "consent:Other/MissingAccessToken")
    }

    func testReportIsCappedButStillNamesEveryStep() {
        let longDetail = String(repeating: "word ", count: 100)
        let steps = [KakaoSignInFailure.Step.talk, .account, .consent].map {
            failure($0, family: "ApiFailed", reason: "TalkSendMessageMonthlyLimitExceed", detail: longDetail)
        }

        let report = KakaoSignInFailure.report(steps)

        XCTAssertLessThanOrEqual(report.count, KakaoSignInFailure.reportLimit)
        let classes = [
            "talk:ApiFailed/TalkSendMessageMonthlyLimitExceed",
            "account:ApiFailed/TalkSendMessageMonthlyLimitExceed",
            "consent:ApiFailed/TalkSendMessageMonthlyLimitExceed",
        ].joined(separator: " ")
        XCTAssertTrue(report.hasPrefix(classes), report)
    }

    func testOneDetailCannotCrowdOutTheRest() {
        let report = KakaoSignInFailure.report([failure(detail: String(repeating: "ab ", count: 400))])

        // "talk: " + the capped detail, after the classification and its separator.
        let detail = report.components(separatedBy: " | ").last ?? ""
        XCTAssertLessThanOrEqual(detail.count, 6 + 100)
    }

    // MARK: - Nothing the SDK echoes leaks

    func testSecretsAndUrlsAreRemovedFromDetails() {
        let leaky: [(detail: String, secret: String)] = [
            ("redirect failed kakao0123abcd://oauth?code=SECRETCODE&state=xyz", "SECRETCODE"),
            ("redirect failed kakao0123abcd://oauth?code=SECRETCODE&state=xyz", "kakao0123abcd"),
            ("bad grant: https://kauth.kakao.com/oauth/token?client_id=APPKEY123", "APPKEY123"),
            ("invalid access_token=abcDEF123456 for user", "abcDEF123456"),
            ("Authorization: Bearer ya29.A0ARrdaM-secretvalue", "secretvalue"),
            (
                "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
                "eyJhbGci"
            ),
            ("opaque abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456789 value", "abcdefghijklmnopqrstuvwxyz"),
        ]

        for item in leaky {
            let report = KakaoSignInFailure.report([failure(detail: item.detail)])
            XCTAssertFalse(report.contains(item.secret), "\(item.secret) leaked in: \(report)")
        }
    }

    /// Redaction must not eat the words that make a report useful.
    func testOrdinaryMessagesSurviveUntouched() {
        let report = KakaoSignInFailure.report([
            failure(family: "ApiFailed", reason: "InvalidAccessToken", detail: "-401 this access token does not exist"),
        ])

        XCTAssertTrue(report.hasSuffix("talk: -401 this access token does not exist"), report)
    }

    func testIdentifiersCannotCarryFreeText() {
        let hostile = failure(family: "Client Failed://x?y=z", reason: "a b\nc")

        XCTAssertEqual(KakaoSignInFailure.report([hostile]), "talk:Client_Failed___x_y_z/a_b_c")
    }

    func testWhitespaceAndControlCharactersCollapseToSingleSpaces() {
        let report = KakaoSignInFailure.report([failure(detail: "one\ntwo\t\tthree\u{2028}four  five")])

        XCTAssertTrue(report.hasSuffix("talk: one two three four five"), report)
        XCTAssertFalse(report.contains("\n"))
        XCTAssertFalse(report.contains("\u{2028}"))
    }

    // MARK: - Bridge

    /// The page logs `result.error` as a string; whatever it holds must arrive intact and must
    /// not be able to break out of the script that delivers it.
    func testAnyErrorTextSurvivesTheBridgeVerbatim() throws {
        let raw = "He said \"no\" \\ path 'x' </script> line\nbreak \u{1F600} 한글"

        let script = NativeBridge.kakaoResultScript(requestId: "r1", error: raw)

        let prefix = "window.dispatchEvent(new CustomEvent('teameet:native-kakao-result',{detail:"
        XCTAssertTrue(script.hasPrefix(prefix), script)
        XCTAssertTrue(script.hasSuffix("}))"), script)
        XCTAssertFalse(script.contains("\n"), "a raw newline would end the statement early")
        let json = String(script.dropFirst(prefix.count).dropLast(3))
        let detail = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        XCTAssertEqual(detail["error"] as? String, raw)
        XCTAssertEqual(detail["requestId"] as? String, "r1")
    }

    func testAReportBuiltFromHostileDetailsStillReachesThePageIntact() throws {
        let report = KakaoSignInFailure.report([failure(detail: "quote \" backslash \\ apostrophe ' </script>")])

        let script = NativeBridge.kakaoResultScript(requestId: "r1", error: report)

        let prefix = "window.dispatchEvent(new CustomEvent('teameet:native-kakao-result',{detail:"
        let json = String(script.dropFirst(prefix.count).dropLast(3))
        let detail = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        XCTAssertEqual(detail["error"] as? String, report)
    }
}
