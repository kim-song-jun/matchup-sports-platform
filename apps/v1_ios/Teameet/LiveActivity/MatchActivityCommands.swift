import ActivityKit
import Foundation

/// Only Sendable IDs/content cross the lifecycle actor boundary. ActivityKit's SDK Activity
/// reference is not Sendable; resolve it locally for each async system command.
@available(iOS 16.2, *)
enum MatchActivityCommands {
    @discardableResult
    static func update(id: String, state: MatchActivityState, staleDate: Date?) async -> Bool {
        guard let activity = Activity<MatchActivityAttributes>.activities.first(where: { $0.id == id }) else { return false }
        await activity.update(ActivityContent(state: state, staleDate: staleDate))
        return true
    }
    @discardableResult
    static func end(id: String, state: MatchActivityState? = nil, dismissalDate: Date? = nil) async -> Bool {
        guard let activity = Activity<MatchActivityAttributes>.activities.first(where: { $0.id == id }) else { return false }
        let content = state.map { ActivityContent(state: $0, staleDate: nil) }
        await activity.end(content, dismissalPolicy: dismissalDate.map { .after($0) } ?? .immediate)
        return true
    }
}
