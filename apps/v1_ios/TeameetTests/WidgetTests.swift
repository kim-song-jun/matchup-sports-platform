import XCTest

final class WidgetTests: XCTestCase {
    let now = WidgetFormat.parseDate("2026-11-27T03:00:00Z")
    func testRemainingAndroidValues() {
        XCTAssertEqual(WidgetFormat.remaining(now + 40 * 60000, now: now), "40분 남았어요")
        XCTAssertEqual(WidgetFormat.remaining(now + 10000, now: now), "1분 남았어요")
        XCTAssertEqual(WidgetFormat.remaining(now + 3 * 3600000 + 59 * 60000, now: now), "3시간 남았어요")
        XCTAssertEqual(WidgetFormat.remaining(now + 49 * 3600000, now: now), "2일 남았어요")
        XCTAssertEqual(WidgetFormat.remaining(now - 1, now: now), "마감됐어요")
    }
    func testSeoulDatesAndroidValues() {
        XCTAssertEqual(WidgetFormat.dayWord(WidgetFormat.parseDate("2026-11-27T14:30:00Z"), now: now), "오늘")
        XCTAssertEqual(WidgetFormat.dayWord(WidgetFormat.parseDate("2026-11-27T15:10:00Z"), now: now), "내일")
        XCTAssertEqual(WidgetFormat.dayWord(WidgetFormat.parseDate("2026-12-01T10:00:00Z"), now: now), "12/1(화)")
        XCTAssertEqual(WidgetFormat.clock(WidgetFormat.parseDate("2026-11-27T10:05:00Z")), "19:05")
        XCTAssertEqual([1,2,3].map(WidgetFormat.periodName), ["전반", "후반", "3구간"])
    }
    func testElapsedAndroidValues() {
        var p = WidgetModel.Period(startedAt: now - 20 * 60000)
        XCTAssertEqual(WidgetFormat.elapsedMs(p, now: now), 20 * 60000)
        p.pausedMs = 60000
        XCTAssertEqual(WidgetFormat.elapsedMs(p, now: now), 19 * 60000)
        p.pausedMs = 0; p.pausedAt = now - 5 * 60000
        XCTAssertEqual(WidgetFormat.elapsedMs(p, now: now), 15 * 60000)
        XCTAssertEqual(WidgetFormat.elapsedMs(nil, now: now), -1)
        XCTAssertEqual(WidgetFormat.minuteMark(12 * 60000 + 59000), "12'")
        XCTAssertEqual(WidgetFormat.restFor(now - 8 * 60000 - 5000, now: now), "8분째 휴식")
    }
    func testScorersAndroidValues() {
        XCTAssertEqual(WidgetFormat.scorerLine(.init(side: "MINE", name: "김OO", minute: 5)), "김OO 5'")
        XCTAssertEqual(WidgetFormat.scorerLine(.init(side: "OPPONENT", name: nil, minute: 17)), "득점 17'")
        XCTAssertEqual(WidgetFormat.scorerLine(.init(side: "OPPONENT", name: "최OO", minute: 3, ownGoal: true)), "최OO (자책) 3'")
        XCTAssertEqual(WidgetFormat.scorerLine(.init(side: "OPPONENT", name: nil, minute: nil)), "득점")
    }
    func testPriorityAndroidValues() {
        let p = WidgetModel.Schedule(scheduleId: "p", startAt: now + 3 * 3600000, canRespond: true)
        let s = WidgetModel.Schedule(scheduleId: "s", startAt: now + 4 * 3600000)
        var m = WidgetModel(live: [.init(state: "LIVE")], pending: [p], schedules: [s])
        XCTAssertEqual(WidgetPlan.of(m, now: now).kind, .live)
        m.live[0].state = "ENDED"
        XCTAssertEqual(WidgetPlan.of(m, now: now).kind, .live)
        m.live = []
        XCTAssertEqual(WidgetPlan.of(m, now: now).kind, .pending)
        m.pending[0].canRespond = false
        XCTAssertEqual(WidgetPlan.of(m, now: now).kind, .schedule)
        m.schedules = []
        XCTAssertEqual(WidgetPlan.of(m, now: now).kind, .empty)
    }
    func testNextDaySkipsSameDay() {
        let schedules = [8, 10, 31].map { WidgetModel.Schedule(scheduleId: String($0), startAt: now + Int64($0) * 3600000) }
        XCTAssertEqual(WidgetPlan.of(.init(schedules: schedules), now: now).tomorrow?.scheduleId, "31")
        XCTAssertNil(WidgetPlan.of(.init(schedules: [schedules[0]]), now: now).tomorrow)
    }
    func testNullPrivacyAndSparseAndroidValues() throws {
        let m = try WidgetModel.parse(Data(#"{"data":{"live":[{"gameId":"g","teamName":"a","state":"LIVE","score":null,"scorers":[]}],"pending":[{}],"schedules":null}}"#.utf8))
        XCTAssertNil(m.live[0].score)
        XCTAssertEqual(m.pending[0].startAt, -1)
        XCTAssertFalse(m.pending[0].canRespond)
        XCTAssertThrowsError(try WidgetModel.parse(Data("<html>502</html>".utf8)))
    }
    func testCacheBoundaryAndLogoutRace() throws {
        let group = "WidgetTests." + UUID().uuidString
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(group)
        let store = WidgetStore(group: group, directory: dir)
        defer { UserDefaults(suiteName: group)?.removePersistentDomain(forName: group); try? FileManager.default.removeItem(at: dir) }
        let a = try store.transition(owner: "account-a").state
        XCTAssertTrue(try store.update(revision: a.revision) { $0.token = "test-only-placeholder"; $0.model = .init(); $0.updatedAt = now })
        let cached = try store.read()
        XCTAssertTrue(WidgetStore.usable(cached, now: now + WidgetStore.cacheLifetime - 1))
        XCTAssertFalse(WidgetStore.usable(cached, now: now + WidgetStore.cacheLifetime))
        _ = try store.transition(owner: nil)
        XCTAssertFalse(try store.update(revision: a.revision) { $0.model = .init() })
        XCTAssertNil(try store.read().token)
        XCTAssertNil(try store.read().model)
    }
    func testAnsweredMovesScheduleOutOfPendingAndKeepsSavedStatus() {
        let p = WidgetModel.Schedule(scheduleId: "p", canRespond: true)
        let other = WidgetModel.Schedule(scheduleId: "o", canRespond: true)
        let m = WidgetModel(pendingCount: 2, pending: [p, other], schedules: [p])
        let next = m.answered("p", status: "WAITLISTED")
        XCTAssertEqual(next.pending.map(\.scheduleId), ["o"])
        XCTAssertEqual(next.pendingCount, 1)
        XCTAssertEqual(next.schedules[0].myResponse, "WAITLISTED")
        XCTAssertFalse(next.schedules[0].canRespond)
        XCTAssertEqual(m.answered("missing", status: "GOING"), m)
    }
    func testSavedStatusReadsServerResponseOrFallsBack() {
        XCTAssertEqual(WidgetAPI.savedStatus(Data(#"{"data":{"status":"WAITLISTED"}}"#.utf8), requested: "GOING"), "WAITLISTED")
        XCTAssertEqual(WidgetAPI.savedStatus(Data(#"{"status":"NOT_GOING"}"#.utf8), requested: "NOT_GOING"), "NOT_GOING")
        XCTAssertEqual(WidgetAPI.savedStatus(Data("nope".utf8), requested: "GOING"), "GOING")
        XCTAssertEqual(WidgetAPI.savedStatus(Data(#"{"data":{}}"#.utf8), requested: "GOING"), "GOING")
    }
}
