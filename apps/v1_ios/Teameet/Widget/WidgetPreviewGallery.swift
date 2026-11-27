#if DEBUG
import SwiftUI
import WidgetKit

/// Explicit simulator-only sample gallery. Uses the shipping view, never writes tokens,
/// cache, or attendance. This is visual evidence, not proof of a live API transaction.
struct WidgetPreviewGallery: View {
    private func sample() -> HomeEntry {
        let args = ProcessInfo.processInfo.arguments
        let state = args.last ?? "live"
        let now = WidgetFormat.now
        let schedule = WidgetModel.Schedule(scheduleId: "sample", teamName: "한강 로버스", title: "팀 훈련", type: "TRAINING", startAt: now + 7 * 3600000, rsvpDeadlineAt: now + 3 * 3600000, placeName: "한강 구장", goingCount: 8, capacity: 12, canRespond: true)
        var game = WidgetModel.Live(teamName: "한강 로버스", opponentName: "마포 레인저스", competitionName: "서울 나이트 풋살 리그", state: state == "ended" ? "ENDED" : state == "paused" ? "PAUSED" : "LIVE", score: .init(mine: 2, opponent: 1), period: .init(number: 2, phase: "RUNNING", startedAt: now - 12 * 60000), scorers: [.init(side: "MINE", name: "김OO", minute: 5), .init(side: "OPPONENT", name: nil, minute: 17)])
        if state == "halftime" { game.period?.phase = "HALFTIME"; game.period?.restStartedAt = now - 8 * 60000 }
        if state == "paused" { game.period?.pausedAt = now }
        if state == "ended" { game.period = nil }
        let model: WidgetModel = switch state {
        case "pending": .init(pending: [schedule])
        case "schedule": .init(schedules: [schedule])
        case "empty": .init(lastResult: .init(teamName: "한강 로버스", opponentName: "마포", score: .init(mine: 2, opponent: 1), result: "WIN"))
        default: .init(generatedAt: now, live: [game])
        }
        return HomeEntry(date: Date(), snapshot: WidgetSnapshot(model: model, updatedAt: now, stale: false))
    }
    var body: some View {
        let state = ProcessInfo.processInfo.arguments.last ?? "live"
        let entry = sample()
        VStack(alignment: .leading, spacing: 24) {
            Text("샘플 시각 검증 · \(state)").font(.headline).foregroundStyle(.white)
            HomeWidgetView(entry: entry, previewFamily: .systemMedium).padding(16).frame(width: 354, height: 170).background(Color(red: 0.21, green: 0.30, blue: 0.49)).clipShape(RoundedRectangle(cornerRadius: 24))
            HomeWidgetView(entry: entry, previewFamily: .systemSmall).padding(16).frame(width: 170, height: 170).background(Color(red: 0.21, green: 0.30, blue: 0.49)).clipShape(RoundedRectangle(cornerRadius: 24))
            LockWidgetView(entry: entry, previewFamily: .accessoryRectangular)
                .frame(width: 170, height: 76).foregroundStyle(.white)
            LockWidgetView(entry: entry, previewFamily: .accessoryInline)
                .frame(width: 354, height: 24, alignment: .leading).foregroundStyle(.white).lineLimit(1)
            Text("고정 샘플 · API/실제 위젯 갤러리 검증과 별도").font(.caption).foregroundStyle(.white)
        }.padding().frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(red: 0.05, green: 0.08, blue: 0.18))
    }
}
#endif
