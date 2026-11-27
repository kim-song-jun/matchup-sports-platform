#if DEBUG
import ActivityKit
import SwiftUI

@available(iOS 16.2, *)
struct MatchActivityPreview: View {
    @State private var activityID: String?
    @State private var outcome = "실제 API와 별도인 고정 샘플"
    private var state: MatchActivityState {
        let kind = ProcessInfo.processInfo.arguments.last ?? "live"
        let now = WidgetFormat.now
        var game = WidgetModel.Live(gameId: "debug-activity-sample", teamName: "한강 로버스", opponentName: "마포 레인저스",
            competitionName: "서울 나이트 풋살 리그", venueName: "한강 풋살장", score: .init(mine: 2, opponent: 1),
            period: .init(number: 2, startedAt: now - 720_000))
        if kind == "halftime" { game.period?.phase = "HALFTIME"; game.period?.restStartedAt = now - 480_000 }
        if kind == "paused" { game.state = "PAUSED"; game.period?.pausedAt = now }
        if kind == "ended" || kind == "penalties" { game.state = "ENDED"; game.period = nil }
        if kind == "penalties" { game.score = .init(mine: 1, opponent: 1); game.penalties = .init(mine: 4, opponent: 3) }
        if kind == "hidden" { game.score = nil }
        return MatchActivityState(game: game, now: now)
    }
    nonisolated private static func updateSample(id: String?, state: MatchActivityState, end: Bool) async -> Bool {
        guard let id else { return false }
        if end { return await MatchActivityCommands.end(id: id, state: state) }
        return await MatchActivityCommands.update(id: id, state: state, staleDate: Date().addingTimeInterval(60))
    }
    var body: some View {
        let stale = ProcessInfo.processInfo.arguments.last == "stale"
        ScrollView {
            VStack(spacing: 20) {
                Text("Live Activity 샘플").font(.headline)
                MatchActivityCard(state: state, stale: stale).background(.black, in: RoundedRectangle(cornerRadius: 24))
                Text("펼친 아일랜드 구성 · 고정 레이아웃 미리보기").font(.caption)
                HStack {
                    MatchActivityTeam(name: state.teamName, logoKey: nil, size: 28)
                    VStack { Text(WidgetFormat.score(state.score)).font(.title.bold()); MatchActivityClock(state: state, stale: stale) }
                    MatchActivityTeam(name: state.opponentName, logoKey: nil, size: 28)
                }.padding().frame(maxWidth: .infinity).background(.black, in: RoundedRectangle(cornerRadius: 24))
                HStack { Text(stale ? "갱신 지연" : state.status); Spacer(); Text(WidgetFormat.score(state.score)); MatchActivityClock(state: state, stale: stale, compact: true) }
                    .font(.caption).padding().background(.black, in: Capsule())
                Text(WidgetFormat.score(state.score)).font(.caption.bold()).padding().background(.black, in: Circle())
                Button("시스템 샘플 카드 시작") {
                    do {
                        let created = try Activity<MatchActivityAttributes>.request(attributes: .init(gameID: "debug-activity-sample", revision: "debug-sample"),
                            content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(60)), pushType: nil)
                        activityID = created.id
                        outcome = "시스템 카드 시작됨"
                    } catch { outcome = "시스템 카드 시작 실패: \(error.localizedDescription)" }
                }.disabled(activityID != nil).accessibilityIdentifier("start-activity-sample")
                Button("시스템 샘플 갱신") {
                    Task { outcome = "시스템 갱신 요청 중"; let sent = await Self.updateSample(id: activityID, state: state, end: false); outcome = sent ? "시스템 카드 갱신됨" : "시스템 카드를 찾지 못했어요" }
                }.disabled(activityID == nil).accessibilityIdentifier("update-activity-sample")
                Button("종료 화면 15분 유지") {
                    Task {
                        guard let activityID else { return }
                        var final = state; final.state = "ENDED"; final.period = nil
                        let sent = await MatchActivityCommands.end(id: activityID, state: final, dismissalDate: Date().addingTimeInterval(900))
                        outcome = sent ? "시스템 카드 종료 화면 유지됨" : "시스템 카드를 찾지 못했어요"
                    }
                }.disabled(activityID == nil).accessibilityIdentifier("final-activity-sample")
                Button("시스템 샘플 종료") {
                    Task { let sent = await Self.updateSample(id: activityID, state: state, end: true); activityID = nil; outcome = sent ? "시스템 카드 종료됨" : "시스템 카드를 찾지 못했어요" }
                }.disabled(activityID == nil).accessibilityIdentifier("end-activity-sample")
                Text(outcome).font(.caption).accessibilityIdentifier("activity-sample-outcome")
                Text("위 구성은 고정 샘플이며 실제 아일랜드 배치는 시스템이 결정해요. API 검증과 별도예요.").font(.caption)
            }.buttonStyle(.bordered).controlSize(.large).foregroundStyle(.white).padding()
        }.background(Color(red: 0.05, green: 0.08, blue: 0.18))
    }
}
#endif
