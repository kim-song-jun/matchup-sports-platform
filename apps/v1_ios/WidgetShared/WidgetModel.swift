import Foundation

/// Mirrors PR #2556 WidgetModel. Nullable score and names preserve server privacy gates.
struct WidgetModel: Codable, Sendable, Equatable {
    struct Score: Codable, Sendable, Hashable { var mine: Int; var opponent: Int }
    struct Period: Codable, Sendable, Hashable {
        var number = 1
        var phase = "RUNNING"
        var startedAt: Int64 = -1
        var pausedMs: Int64 = 0
        var pausedAt: Int64 = -1
        var restStartedAt: Int64 = -1
    }
    struct Scorer: Codable, Sendable, Equatable {
        var side: String
        var name: String?
        var minute: Int?
        var ownGoal = false
    }
    struct Live: Codable, Sendable, Equatable {
        var gameId = ""
        var teamName = ""
        var teamLogoUrl: String?
        var opponentName: String?
        var opponentLogoUrl: String?
        var competitionName: String?
        var venueName: String?
        var state = "LIVE"
        var score: Score?
        var penalties: Score?
        var period: Period?
        var scorers: [Scorer] = []
    }
    struct Schedule: Codable, Sendable, Equatable {
        var scheduleId = ""
        var teamName = ""
        var teamLogoUrl: String?
        var title = ""
        var type = ""
        var startAt: Int64 = -1
        var endAt: Int64 = -1
        var rsvpDeadlineAt: Int64 = -1
        var placeName: String?
        var opponentName: String?
        var opponentLogoUrl: String?
        var competitionName: String?
        var goingCount = 0
        var capacity = 0
        var myResponse: String?
        var canRespond = false
        func isRespondable(at now: Int64) -> Bool {
            canRespond && (rsvpDeadlineAt < 0 || rsvpDeadlineAt > now) && (endAt < 0 || endAt > now)
        }
    }
    struct LastResult: Codable, Sendable, Equatable {
        var teamName: String
        var opponentName: String?
        var score: Score?
        var penalties: Score?
        var result: String
    }
    var generatedAt: Int64 = -1
    var live: [Live] = []
    var lastResult: LastResult?
    var pendingCount = 0
    var pending: [Schedule] = []
    var schedules: [Schedule] = []

    /// Reflects an answer the server accepted: the schedule leaves the pending list and carries the saved status.
    func answered(_ id: String, status: String) -> Self {
        var next = self
        if next.pending.contains(where: { $0.scheduleId == id }) { next.pendingCount = max(0, next.pendingCount - 1) }
        next.pending.removeAll { $0.scheduleId == id }
        for index in next.schedules.indices where next.schedules[index].scheduleId == id {
            next.schedules[index].myResponse = status
            next.schedules[index].canRespond = false
        }
        return next
    }

    static func parse(_ data: Data) throws -> Self {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let body = (root["data"] as? [String: Any]) ?? (root["data"] == nil ? root : nil)
        else { throw WidgetFailure.invalidResponse }
        func objects(_ value: Any?) -> [[String: Any]] { (value as? [Any] ?? []).compactMap { $0 as? [String: Any] } }
        func string(_ o: [String: Any], _ key: String) -> String? {
            guard let s = o[key] as? String else { return nil }
            let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        func millis(_ o: [String: Any], _ key: String) -> Int64 { WidgetFormat.parseDate(string(o, key)) }
        func score(_ value: Any?) -> Score? {
            guard let s = value as? [String: Any], let mine = s["mine"] as? Int,
                  let opponent = s["opponent"] as? Int, mine >= 0, opponent >= 0 else { return nil }
            return Score(mine: mine, opponent: opponent)
        }
        func schedule(_ o: [String: Any]) -> Schedule {
            Schedule(scheduleId: string(o, "scheduleId") ?? "", teamName: string(o, "teamName") ?? "",
                     teamLogoUrl: string(o, "teamLogoUrl"), title: string(o, "title") ?? "", type: string(o, "type") ?? "",
                     startAt: millis(o, "startAt"), endAt: millis(o, "endAt"), rsvpDeadlineAt: millis(o, "rsvpDeadlineAt"),
                     placeName: string(o, "placeName"), opponentName: string(o, "opponentName"),
                     opponentLogoUrl: string(o, "opponentLogoUrl"), competitionName: string(o, "competitionName"),
                     goingCount: o["goingCount"] as? Int ?? 0, capacity: o["capacity"] as? Int ?? 0,
                     myResponse: string(o, "myResponse"), canRespond: o["canRespond"] as? Bool ?? false)
        }
        let games = objects(body["live"]).map { o -> Live in
            let p = o["period"] as? [String: Any]
            let period = p.map { Period(number: $0["number"] as? Int ?? 1, phase: string($0, "phase") ?? "RUNNING",
                                       startedAt: millis($0, "startedAt"), pausedMs: $0["pausedMs"] as? Int64 ?? 0,
                                       pausedAt: millis($0, "pausedAt"), restStartedAt: millis($0, "restStartedAt")) }
            let scorers = objects(o["scorers"]).map {
                Scorer(side: string($0, "side") ?? "OPPONENT", name: string($0, "name"),
                       minute: ($0["minute"] as? Int).flatMap { $0 < 0 ? nil : $0 }, ownGoal: $0["ownGoal"] as? Bool ?? false)
            }
            return Live(gameId: string(o, "gameId") ?? "", teamName: string(o, "teamName") ?? "",
                        teamLogoUrl: string(o, "teamLogoUrl"), opponentName: string(o, "opponentName"),
                        opponentLogoUrl: string(o, "opponentLogoUrl"), competitionName: string(o, "competitionName"),
                        venueName: string(o, "venueName"), state: string(o, "state") ?? "LIVE", score: score(o["score"]),
                        penalties: score(o["penalties"]), period: period, scorers: scorers)
        }
        let last = (body["lastResult"] as? [String: Any]).map {
            LastResult(teamName: string($0, "teamName") ?? "", opponentName: string($0, "opponentName"),
                       score: score($0["score"]), penalties: score($0["penalties"]), result: string($0, "result") ?? "DRAW")
        }
        return Self(generatedAt: millis(body, "generatedAt"), live: games, lastResult: last,
                    pendingCount: body["pendingCount"] as? Int ?? 0,
                    pending: objects(body["pending"]).map(schedule), schedules: objects(body["schedules"]).map(schedule))
    }
}
