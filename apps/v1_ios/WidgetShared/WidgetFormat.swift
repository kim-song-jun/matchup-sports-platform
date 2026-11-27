import Foundation

enum WidgetFormat {
    static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    static func date(_ ms: Int64) -> Date { Date(timeIntervalSince1970: Double(ms) / 1000) }
    static func parseDate(_ value: String?) -> Int64 {
        guard let value else { return -1 }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: value)
        if d == nil { f.formatOptions = [.withInternetDateTime]; d = f.date(from: value) }
        return d.map { Int64(($0.timeIntervalSince1970 * 1000).rounded()) } ?? -1
    }
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }
    static func remaining(_ deadline: Int64, now: Int64) -> String {
        let left = deadline - now
        if left <= 0 { return "마감됐어요" }
        let minutes = left / 60_000
        if minutes < 60 { return "\(max(1, minutes))분 남았어요" }
        let hours = minutes / 60
        return hours < 24 ? "\(hours)시간 남았어요" : "\(hours / 24)일 남았어요"
    }
    static func dayWord(_ start: Int64, now: Int64) -> String {
        guard start >= 0 else { return "일정 미정" }
        let c = calendar, d = date(start)
        let diff = c.dateComponents([.day], from: c.startOfDay(for: date(now)), to: c.startOfDay(for: d)).day
        if diff == 0 { return "오늘" }; if diff == 1 { return "내일" }
        let p = c.dateComponents([.month, .day, .weekday], from: d)
        return "\(p.month!)/\(p.day!)(\(["일", "월", "화", "수", "목", "금", "토"][p.weekday! - 1]))"
    }
    static func clock(_ start: Int64) -> String {
        guard start >= 0 else { return "시간 미정" }
        let c = calendar.dateComponents([.hour, .minute], from: date(start))
        return String(format: "%02d:%02d", c.hour!, c.minute!)
    }
    static func periodName(_ n: Int) -> String { n == 1 ? "전반" : n == 2 ? "후반" : "\(n)구간" }
    static func elapsedMs(_ p: WidgetModel.Period?, now: Int64) -> Int64 {
        guard let p, p.startedAt >= 0 else { return -1 }
        return max(0, now - p.startedAt - p.pausedMs - (p.pausedAt >= 0 ? max(0, now - p.pausedAt) : 0))
    }
    static func minuteMark(_ elapsed: Int64) -> String { "\(elapsed / 60_000)'" }
    static func restFor(_ start: Int64, now: Int64) -> String { start < 0 ? "휴식 중" : "\(max(0, (now - start) / 60_000))분째 휴식" }
    static func scorerLine(_ s: WidgetModel.Scorer) -> String {
        let who = s.name.map { $0 + (s.ownGoal ? " (자책)" : "") } ?? "득점"
        return who + (s.minute.map { " \($0)'" } ?? "")
    }
    static func score(_ score: WidgetModel.Score?) -> String { score.map { "\($0.mine):\($0.opponent)" } ?? "—:—" }
}

struct WidgetPlan: Sendable {
    enum Kind { case live, pending, schedule, empty }
    var kind: Kind
    var live: WidgetModel.Live?
    var schedule: WidgetModel.Schedule?
    var tomorrow: WidgetModel.Schedule?
    var lastResult: WidgetModel.LastResult?
    static func of(_ model: WidgetModel, now: Int64) -> Self {
        if let live = model.live.first { return Self(kind: .live, live: live) }
        if let p = model.pending.first(where: { $0.isRespondable(at: now) }) { return Self(kind: .pending, schedule: p) }
        if let first = model.schedules.first {
            let next = model.schedules.dropFirst().first { WidgetFormat.dayWord($0.startAt, now: now) != WidgetFormat.dayWord(first.startAt, now: now) }
            return Self(kind: .schedule, schedule: first, tomorrow: next)
        }
        return Self(kind: .empty, lastResult: model.lastResult)
    }
}
