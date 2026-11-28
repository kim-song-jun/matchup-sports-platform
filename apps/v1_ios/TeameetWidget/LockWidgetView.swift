import SwiftUI
import WidgetKit

/// WidgetKit accessories, not an ActivityKit card. No fill, chips, progress rail or buttons.
struct LockWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HomeEntry
    var previewFamily: WidgetFamily? = nil
    private var now: Int64 { Int64(entry.date.timeIntervalSince1970 * 1000) }
    private var inline: Bool { (previewFamily ?? family) == .accessoryInline }
    private var expired: Bool { entry.snapshot.updatedAt >= 0 && now - entry.snapshot.updatedAt >= WidgetStore.cacheLifetime }
    var body: some View {
        Group {
            if let model = entry.snapshot.model, !expired {
                let plan = WidgetPresentation.plan(model, updatedAt: entry.snapshot.updatedAt, now: now)
                if inline {
                    Text((entry.snapshot.stale ? "갱신 지연 · " : "") + WidgetPresentation.inline(plan, now: now))
                } else { rectangular(plan) }
            } else {
                Text(expired ? "팀밋 · 앱에서 새로고침해 주세요" : entry.snapshot.notice ?? "팀밋에 로그인해 주세요")
                    .font(.caption).lineLimit(inline ? 1 : 3)
            }
        }.widgetURL(WidgetEnvironment.current.origin.appendingPathComponent("my/schedule"))
            .modifier(LockBackground())
    }
    private func rectangular(_ plan: WidgetPlan) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let game = plan.live {
                // 윗줄에 상태와 시계(후반 12:03), 가운데 점수, 아랫줄에 리그·장소 — 카드 크기는 그대로다.
                HStack(spacing: 4) {
                    Text(WidgetPresentation.liveStatus(game) + (entry.snapshot.stale ? " · 갱신 지연" : ""))
                    if let penalties = game.penalties { Text("승부차기 \(WidgetFormat.score(penalties))") }
                    else if let period = game.period { clock(period, game: game) }
                }.font(.caption2.bold()).lineLimit(1)
                Text("\(game.teamName) \(WidgetFormat.score(game.score)) \(game.opponentName ?? "상대팀")")
                    .font(.caption.bold()).lineLimit(1).minimumScaleFactor(0.8)
                let place = [game.competitionName, game.venueName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                Text(place.isEmpty ? (game.state == "ENDED" ? "경기 종료" : "경기 중") : place).font(.caption2).lineLimit(1)
            } else if let schedule = plan.schedule {
                Text(plan.kind == .pending ? "응답 대기" : WidgetFormat.dayWord(schedule.startAt, now: now)).font(.caption2.bold())
                Text("\(WidgetFormat.clock(schedule.startAt)) \(schedule.opponentName.map { "vs " + $0 } ?? schedule.title)")
                    .font(.caption.bold()).lineLimit(1).minimumScaleFactor(0.8)
                if entry.snapshot.stale { Text("갱신 지연 · 앱에서 확인해 주세요").font(.caption2).lineLimit(1) }
                else if plan.kind == .pending, schedule.rsvpDeadlineAt >= 0 { Text(WidgetFormat.remaining(schedule.rsvpDeadlineAt, now: now)).font(.caption2) }
                else { Text(schedule.placeName ?? schedule.teamName).font(.caption2).lineLimit(1) }
            } else {
                Text("팀밋").font(.caption2.bold())
                Text("예정된 일정이 없어요").font(.caption.bold()).lineLimit(2)
                if let last = plan.lastResult { Text("지난 경기 \(WidgetFormat.score(last.score))").font(.caption2) }
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
    @ViewBuilder private func clock(_ period: WidgetModel.Period, game: WidgetModel.Live) -> some View {
        HStack(spacing: 3) {
            if period.phase == "HALFTIME" {
                if period.restStartedAt >= 0 {
                    Text("휴식"); Text(WidgetFormat.date(period.restStartedAt), style: .timer).monospacedDigit()
                } else { Text("휴식 중") }
            } else {
                Text(WidgetFormat.periodName(period.number))
                let elapsed = WidgetFormat.elapsedMs(period, now: now)
                if elapsed >= 0 {
                    if period.pausedAt >= 0 || game.state == "PAUSED" || period.phase == "PAUSED" { Text(WidgetFormat.minuteMark(elapsed)) }
                    else { Text(WidgetFormat.date(now - elapsed), style: .timer).monospacedDigit() }
                }
            }
        }.font(.caption2).lineLimit(1)
    }
}
private struct LockBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) { content.containerBackground(for: .widget) { Color.clear } }
        else { content }
    }
}
