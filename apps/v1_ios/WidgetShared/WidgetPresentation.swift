import Foundation

enum WidgetPresentation {
    static func plan(_ model: WidgetModel, updatedAt: Int64, now: Int64) -> WidgetPlan {
        var current = model
        let received = model.generatedAt >= 0 ? model.generatedAt : updatedAt
        if now - received >= 900_000 { current.live.removeAll { $0.state == "ENDED" } }
        return WidgetPlan.of(current, now: now)
    }
    static func liveStatus(_ game: WidgetModel.Live) -> String {
        if game.state == "ENDED" { return "종료" }
        if game.period?.phase == "HALFTIME" { return "하프타임" }
        if game.state == "PAUSED" || game.period?.phase == "PAUSED" { return "일시정지" }
        return "● LIVE"
    }
    static func inline(_ plan: WidgetPlan, now: Int64) -> String {
        if let game = plan.live {
            let mine = game.teamName.split(separator: " ").first.map(String.init) ?? game.teamName
            let opponent = game.opponentName?.split(separator: " ").first.map(String.init) ?? "상대"
            let penalties = game.penalties.map { " (PK \(WidgetFormat.score($0)))" } ?? ""
            return "\(liveStatus(game)) \(mine) \(WidgetFormat.score(game.score))\(penalties) \(opponent)"
        }
        if let schedule = plan.schedule {
            return (plan.kind == .pending ? "응답 대기 · " : WidgetFormat.dayWord(schedule.startAt, now: now) + " ")
                + WidgetFormat.clock(schedule.startAt) + " " + (schedule.opponentName.map { "vs " + $0 } ?? schedule.title)
        }
        return "팀밋 · 예정 없음"
    }
}
