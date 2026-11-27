import Foundation
import os
import XCTest

final class MatchActivityPushTests: XCTestCase {
    func testServerContentStateUsesLiveShapeNullsAndISOPeriod() throws {
        let data = Data(#"{"gameId":"g","teamName":"한강","opponentName":null,"competitionName":null,"venueName":null,"state":"PAUSED","score":null,"penalties":null,"teamLogoUrl":"/images/mine.png","opponentLogoUrl":null,"period":{"number":2,"phase":"PAUSED","startedAt":"2026-11-27T03:00:00Z","pausedMs":60000,"pausedAt":"2026-11-27T03:15:00Z","restStartedAt":null},"endedAt":null}"#.utf8)
        let state = try JSONDecoder().decode(MatchActivityState.self, from: data)
        XCTAssertEqual(state.teamName, "한강")
        XCTAssertEqual(state.opponentName, "상대팀")
        XCTAssertNil(state.score)
        XCTAssertNil(state.endedAt)
        XCTAssertEqual(state.competitionName, "")
        XCTAssertEqual(state.teamLogoKey, WidgetLogoKey.make("/images/mine.png"))
        XCTAssertEqual(WidgetFormat.elapsedMs(state.period, now: state.updatedAt), 840_000)
        let roundTrip = try JSONDecoder().decode(MatchActivityState.self, from: JSONEncoder().encode(state))
        XCTAssertEqual(roundTrip, state)
    }
    func testServerFinalAndMissingFieldAreBackwardCompatible() throws {
        let data = Data(#"{"gameId":"g","teamName":"한강","opponentName":"마포","state":"ENDED","score":{"mine":2,"opponent":1},"period":null,"endedAt":1000000}"#.utf8)
        let final = try JSONDecoder().decode(MatchActivityState.self, from: data)
        XCTAssertEqual(final.endedAt, 1_000_000)
        XCTAssertEqual(final.score?.mine, 2)
        let old = try JSONDecoder().decode(MatchActivityState.self, from: Data(#"{"state":"ENDED","teamName":"a"}"#.utf8))
        XCTAssertNil(old.endedAt)
        let home = try WidgetModel.parse(Data(#"{"data":{"live":[{"gameId":"g","endedAt":1000000},{"gameId":"old"},{"gameId":"null","endedAt":null}]}}"#.utf8))
        XCTAssertEqual(home.live.map(\.endedAt), [1_000_000, nil, nil])
        let cached = try JSONDecoder().decode(WidgetModel.self, from: JSONEncoder().encode(home))
        XCTAssertEqual(cached, home)
    }
    func testServerDeadlineSurvivesRelaunchFallbackAndLateUpdates() throws {
        var ledger = MatchActivityLedger()
        let ended: Int64 = 1_000_000
        XCTAssertEqual(ledger.endDeadline(gameID: "g", now: ended + 100_000, endedAt: ended), ended + 900_000)
        var reloaded = try JSONDecoder().decode(MatchActivityLedger.self, from: JSONEncoder().encode(ledger))
        XCTAssertEqual(reloaded.endDeadline(gameID: "g", now: ended + 2_000_000), ended + 900_000)
        XCTAssertLessThan(reloaded.endDeadline(gameID: "g", now: ended + 2_000_000), ended + 2_000_000)
        XCTAssertEqual(reloaded.endDeadline(gameID: "g", now: ended + 3_000_000, endedAt: ended + 800_000), ended + 900_000)
        XCTAssertEqual(reloaded.endDeadline(gameID: "offline", now: ended), ended + 900_000)
        XCTAssertEqual(reloaded.endDeadline(gameID: "offline", now: ended + 10_000, endedAt: ended - 50_000), ended + 850_000)
        XCTAssertEqual(reloaded.endDeadline(gameID: "other", now: ended + 10_000, endedAt: -1), ended + 910_000)
    }
    func testPeriodAcceptsMillisAndNullableLegacyFields() throws {
        let state = try JSONDecoder().decode(MatchActivityState.self, from: Data(#"{"state":"LIVE","period":{"number":2,"phase":"HALFTIME","startedAt":null,"pausedAt":null,"pausedMs":0,"restStartedAt":1000000}}"#.utf8))
        XCTAssertEqual(state.period?.startedAt, -1)
        XCTAssertEqual(state.period?.restStartedAt, 1_000_000)
    }
    func testRegistrationAndRevocationSendDraftContractWithoutCookies() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ActivityTokenURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        ActivityTokenURLProtocol.requests.withLock { $0 = [] }
        let client = MatchActivityPushClient(api: WidgetAPI(environment: .init(origin: URL(string: "https://example.invalid")!, group: "test"), session: session))
        let token = Data([0, 1, 0xab, 0xff]) // synthetic bytes, never a real credential
        try await client.register(gameID: "game-1", pushToken: token, widgetToken: "synthetic-widget-credential")
        try await client.revoke(gameID: "game-1", pushToken: token, widgetToken: "synthetic-widget-credential")
        let requests = ActivityTokenURLProtocol.requests.withLock { $0 }
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.map(\.httpMethod), ["PUT", "DELETE"])
        for request in requests {
            XCTAssertEqual(request.url?.absoluteString, "https://example.invalid/api/v1/widget/live-activity-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer synthetic-widget-credential")
            XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try XCTUnwrap(request.httpBody)
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
            XCTAssertEqual(object, ["gameId": "game-1", "pushToken": "0001abff"])
        }
        XCTAssertEqual(MatchActivityPushTokenKind.activity.rawValue, "activity")
    }
    func testHTTPFailureIsNotReportedAsRegistered() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ActivityTokenURLProtocol.self]
        configuration.httpAdditionalHeaders = ["X-Test-Status": "503"]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let client = MatchActivityPushClient(api: WidgetAPI(session: session))
        do {
            try await client.register(gameID: "g", pushToken: Data([1]), widgetToken: "synthetic")
            XCTFail("HTTP failure must not become registration success")
        } catch { XCTAssertEqual(error as? WidgetFailure, .http(503)) }
        XCTAssertThrowsError(try MatchActivityPushClient.body(gameID: "", pushToken: Data([1])))
        XCTAssertThrowsError(try MatchActivityPushClient.body(gameID: "g", pushToken: Data()))
    }
}

/// URLProtocol callbacks are synchronous here. The sole shared mutable state is lock-protected.
private final class ActivityTokenURLProtocol: URLProtocol, @unchecked Sendable {
    static let requests = OSAllocatedUnfairLock(initialState: [URLRequest]())
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var captured = request
        if captured.httpBody == nil, let stream = captured.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 1024); var data = Data()
            while stream.hasBytesAvailable {
                let count = stream.read(&bytes, maxLength: bytes.count)
                if count <= 0 { break }
                data.append(contentsOf: bytes.prefix(count))
            }
            captured.httpBody = data
        }
        let recorded = captured
        Self.requests.withLock { $0.append(recorded) }
        let status = Int(request.value(forHTTPHeaderField: "X-Test-Status") ?? "200") ?? 200
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
