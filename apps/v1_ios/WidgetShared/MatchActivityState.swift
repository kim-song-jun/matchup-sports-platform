import Foundation

/// Bounded public scoreboard only. No cookie, widget token, owner identity or scorer names.
struct MatchActivityState: Codable, Hashable, Sendable {
    var teamName: String
    var opponentName: String
    var competitionName: String
    var venueName: String
    var state: String
    var score: WidgetModel.Score?
    var penalties: WidgetModel.Score?
    var period: WidgetModel.Period?
    var teamLogoKey: String?
    var opponentLogoKey: String?
    var updatedAt: Int64
    var endedAt: Int64? = nil

    init(game: WidgetModel.Live, now: Int64) {
        teamName = String(game.teamName.prefix(80))
        opponentName = String((game.opponentName ?? "상대팀").prefix(80))
        competitionName = String((game.competitionName ?? "").prefix(80))
        venueName = String((game.venueName ?? "").prefix(80))
        state = game.state
        score = game.score
        penalties = game.penalties
        period = game.period
        updatedAt = now
        endedAt = game.endedAt
    }
    var status: String {
        if state == "ENDED" { return "종료" }
        if period?.phase == "HALFTIME" { return "하프타임" }
        if state == "PAUSED" || period?.phase == "PAUSED" { return "일시정지" }
        return "● LIVE"
    }
    var shortPeriod: String {
        guard let p = period else { return "" }
        if p.phase == "HALFTIME" { return "휴식" }
        return p.number == 1 ? "전" : p.number == 2 ? "후" : "\(p.number)구간"
    }
}

/// Persisted independently of login. Swiping a card never becomes consent to recreate it.
struct MatchActivityLedger: Codable, Sendable {
    struct Tracked: Codable, Sendable, Equatable { var gameID: String; var revision: String; var finalized: Bool? = nil }
    var tracked: [String: Tracked] = [:]
    var dismissed: Set<String> = []
    var firstEndedAt: [String: Int64] = [:]
    static let finalDisplayMs: Int64 = 15 * 60 * 1000

    mutating func endDeadline(gameID: String, now: Int64, endedAt: Int64? = nil) -> Int64 {
        let observation = endedAt.flatMap(WidgetMilliseconds.valid) ?? now
        firstEndedAt[gameID] = min(firstEndedAt[gameID] ?? observation, observation)
        return firstEndedAt[gameID]! + Self.finalDisplayMs
    }
    mutating func recordEnd(activityID: String) {
        tracked[activityID]?.finalized = true
    }
    mutating func recordDismissal(activityID: String) {
        if let tracked = tracked.removeValue(forKey: activityID) { dismissed.insert(tracked.gameID) }
    }
    static func selected(in model: WidgetModel) -> WidgetModel.Live? { model.live.first }
    func mayStart(_ game: WidgetModel.Live) -> Bool {
        !game.gameId.isEmpty && ["LIVE", "PAUSED"].contains(game.state)
            && !dismissed.contains(game.gameId)
    }
}

extension MatchActivityState {
    private enum CodingKeys: String, CodingKey {
        case teamName, opponentName, competitionName, venueName, state, score, penalties, period
        case teamLogoKey, opponentLogoKey, updatedAt, endedAt
    }
    private enum LogoKeys: String, CodingKey { case teamLogoUrl, opponentLogoUrl }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let logos = try decoder.container(keyedBy: LogoKeys.self)
        teamName = String((try c.decodeIfPresent(String.self, forKey: .teamName) ?? "").prefix(80))
        opponentName = String((try c.decodeIfPresent(String.self, forKey: .opponentName) ?? "상대팀").prefix(80))
        competitionName = String((try c.decodeIfPresent(String.self, forKey: .competitionName) ?? "").prefix(80))
        venueName = String((try c.decodeIfPresent(String.self, forKey: .venueName) ?? "").prefix(80))
        state = try c.decode(String.self, forKey: .state)
        score = try c.decodeIfPresent(WidgetModel.Score.self, forKey: .score)
        penalties = try c.decodeIfPresent(WidgetModel.Score.self, forKey: .penalties)
        period = try c.decodeIfPresent(WidgetModel.Period.self, forKey: .period)
        teamLogoKey = try c.decodeIfPresent(String.self, forKey: .teamLogoKey)
            ?? logos.decodeIfPresent(String.self, forKey: .teamLogoUrl).map(WidgetLogoKey.make)
        opponentLogoKey = try c.decodeIfPresent(String.self, forKey: .opponentLogoKey)
            ?? logos.decodeIfPresent(String.self, forKey: .opponentLogoUrl).map(WidgetLogoKey.make)
        updatedAt = try WidgetMilliseconds.decode(c, .updatedAt) ?? WidgetFormat.now
        endedAt = try WidgetMilliseconds.decode(c, .endedAt)
    }
}
