import ActivityKit

@available(iOS 16.2, *)
struct MatchActivityAttributes: ActivityAttributes, Sendable {
    typealias ContentState = MatchActivityState
    let gameID: String
    /// Non-secret revision, used only to remove a previous session's card.
    let revision: String
}
