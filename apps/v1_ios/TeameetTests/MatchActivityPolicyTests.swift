import XCTest

final class MatchActivityPolicyTests: XCTestCase {
    func testDismissedGameNeverRestartsAfterRelaunch() throws {
        var ledger = MatchActivityLedger()
        let game = WidgetModel.Live(gameId: "game-1")
        XCTAssertTrue(ledger.mayStart(game))
        ledger.tracked["activity-1"] = .init(gameID: game.gameId, revision: "session-revision")
        ledger.recordDismissal(activityID: "activity-1")
        let reloaded = try JSONDecoder().decode(MatchActivityLedger.self, from: JSONEncoder().encode(ledger))
        XCTAssertFalse(reloaded.mayStart(game))
        XCTAssertTrue(reloaded.mayStart(.init(gameId: "game-2")))
        XCTAssertNil(reloaded.tracked["activity-1"])
    }
    func testFinalCardDismissalStillPreventsRestart() throws {
        var ledger = MatchActivityLedger()
        ledger.tracked["final-card"] = .init(gameID: "game-1", revision: "session")
        ledger.recordEnd(activityID: "final-card")
        var reloaded = try JSONDecoder().decode(MatchActivityLedger.self, from: JSONEncoder().encode(ledger))
        XCTAssertEqual(reloaded.tracked["final-card"]?.finalized, true)
        reloaded.recordDismissal(activityID: "final-card")
        XCTAssertFalse(reloaded.mayStart(.init(gameId: "game-1")))
    }
    func testFirstEndedTimeSurvivesRelaunchAndDoesNotSlide() throws {
        var ledger = MatchActivityLedger()
        let first: Int64 = 1_000_000
        XCTAssertEqual(ledger.endDeadline(gameID: "g", now: first), first + 900_000)
        var reloaded = try JSONDecoder().decode(MatchActivityLedger.self, from: JSONEncoder().encode(ledger))
        XCTAssertEqual(reloaded.endDeadline(gameID: "g", now: first + 899_000), first + 900_000)
        XCTAssertEqual(reloaded.endDeadline(gameID: "g", now: first + 2_000_000), first + 900_000)
        XCTAssertEqual(reloaded.endDeadline(gameID: "other", now: first + 100), first + 900_100)
        // A server-resumed LIVE game can start again unless the user dismissed it.
        // The original first-ended deadline still never moves.
        XCTAssertTrue(reloaded.mayStart(.init(gameId: "g")))
    }
    func testFirstServerGameOnlyAndEndedDoesNotStart() {
        var ledger = MatchActivityLedger()
        ledger.dismissed.insert("first")
        let model = WidgetModel(live: [.init(gameId: "first"), .init(gameId: "second")])
        let selected = MatchActivityLedger.selected(in: model)
        XCTAssertEqual(selected?.gameId, "first")
        XCTAssertFalse(ledger.mayStart(selected!))
        XCTAssertFalse(ledger.mayStart(.init(gameId: "ended", state: "ENDED")))
        XCTAssertFalse(ledger.mayStart(.init(gameId: "")))
        XCTAssertNil(MatchActivityLedger.selected(in: .init()))
    }
    func testPayloadIsBoundedAndPreservesHiddenScoreAndPausedClock() throws {
        let long = String(repeating: "가", count: 4000)
        let game = WidgetModel.Live(gameId: "g", teamName: long, opponentName: long, competitionName: long,
                                   venueName: long, state: "PAUSED", score: nil,
                                   period: .init(number: 2, phase: "PAUSED", startedAt: 1_000_000, pausedMs: 60_000, pausedAt: 1_900_000))
        let state = MatchActivityState(game: game, now: 2_000_000)
        XCTAssertLessThan(try JSONEncoder().encode(state).count, 4096)
        XCTAssertNil(state.score)
        XCTAssertEqual(state.status, "일시정지")
        XCTAssertEqual(WidgetFormat.elapsedMs(state.period, now: state.updatedAt), 840_000)
        XCTAssertEqual(state.teamName.count, 80)
        XCTAssertEqual(state.shortPeriod, "후")
    }
}
