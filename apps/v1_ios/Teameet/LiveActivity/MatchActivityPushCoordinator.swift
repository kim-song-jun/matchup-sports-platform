import ActivityKit
import Foundation

/// Tokens and the credential used for registration live in memory only. The existing
/// WidgetStore remains the sole persisted credential store; nothing enters Activity content.
@available(iOS 16.2, *)
@MainActor
final class MatchActivityPushCoordinator {
    private struct Binding: Equatable {
        let kind: MatchActivityPushTokenKind = .activity
        let gameID: String
        let revision: String
        let pushToken: Data
        let widgetToken: String
    }
    private let client = MatchActivityPushClient()
    private var streams: [String: Task<Void, Never>] = [:]
    private var workers: [String: Task<Void, Never>] = [:]
    private var tickets: [String: UUID] = [:]
    private var desired: [String: Binding] = [:]
    private var registered: [String: Binding] = [:]
    private var pendingRevocations: [Binding] = []
    private var nextRevocationRetry = Date.distantPast
    private var retryingRevocations = false
    private var retryAfter: [String: Date] = [:]
    var onFailure: ((String) -> Void)?

    func observe(_ activity: Activity<MatchActivityAttributes>) {
        guard activity.activityState == .active || activity.activityState == .stale else { return }
        if streams[activity.id] == nil {
            streams[activity.id] = Task { [weak self] in
                for await token in activity.pushTokenUpdates {
                    guard !Task.isCancelled, let self else { return }
                    // A rotated token gets a new attempt immediately, even after a failure.
                    self.retryAfter.removeValue(forKey: activity.id)
                    self.submit(activity, token: token)
                }
            }
        }
        if let token = activity.pushToken { submit(activity, token: token) }
    }
    private func binding(_ activity: Activity<MatchActivityAttributes>, token: Data) -> Binding? {
        guard let state = try? WidgetStore().read(), state.owner != nil,
              state.revision == activity.attributes.revision, let credential = state.token else { return nil }
        return Binding(gameID: activity.attributes.gameID, revision: state.revision, pushToken: token, widgetToken: credential)
    }
    private func submit(_ activity: Activity<MatchActivityAttributes>, token: Data) {
        let id = activity.id
        guard let entry = binding(activity, token: token), registered[id] != entry, desired[id] != entry,
              retryAfter[id].map({ $0 <= Date() }) ?? true else { return }
        let previous = workers[id]
        previous?.cancel()
        let ticket = UUID()
        tickets[id] = ticket; desired[id] = entry
        // Serialize rotations and compensating DELETEs: an older PUT must not win over a new token.
        workers[id] = Task { [weak self] in
            await previous?.value
            guard !Task.isCancelled, let self else { return }
            await self.register(entry, activity: activity, ticket: ticket)
            if self.tickets[id] == ticket {
                self.workers[id] = nil; self.desired[id] = nil; self.tickets[id] = nil
            }
        }
    }
    private func register(_ entry: Binding, activity: Activity<MatchActivityAttributes>, ticket: UUID) async {
        let id = activity.id
        do {
            try await client.register(gameID: entry.gameID, pushToken: entry.pushToken, widgetToken: entry.widgetToken)
            guard !Task.isCancelled, tickets[id] == ticket,
                  binding(activity, token: entry.pushToken) == entry,
                  activity.activityState == .active || activity.activityState == .stale else {
                await unregister(entry)
                return
            }
            registered[id] = entry
            retryAfter[id] = nil
        } catch {
            // Cancellation can race a server commit even if URLSession reports cancellation.
            if Task.isCancelled { await unregister(entry) }
            else {
                retryAfter[id] = Date().addingTimeInterval(60)
                onFailure?("실시간 카드 푸시 연결을 저장하지 못했어요. 앱이 활성화되면 다시 시도해요")
            }
        }
    }
    func revoke(_ activity: Activity<MatchActivityAttributes>) async {
        let id = activity.id
        streams.removeValue(forKey: id)?.cancel()
        let previous = workers.removeValue(forKey: id)
        tickets[id] = nil; desired[id] = nil; retryAfter[id] = nil
        previous?.cancel()
        // Capture the original credential before any suspension or session transition.
        let entry = registered.removeValue(forKey: id)
            ?? activity.pushToken.flatMap { binding(activity, token: $0) }
        await previous?.value
        if let entry { await unregister(entry) }
    }
    func retryRevocations() async {
        guard !retryingRevocations, nextRevocationRetry <= Date(), !pendingRevocations.isEmpty else { return }
        retryingRevocations = true
        defer { retryingRevocations = false }
        nextRevocationRetry = Date().addingTimeInterval(60)
        let pending = pendingRevocations; pendingRevocations.removeAll()
        for entry in pending { await unregister(entry, retry: true) }
    }
    private func unregister(_ entry: Binding, retry: Bool = false) async {
        do {
            // An unstructured cleanup task does not inherit a cancelled PUT's cancellation.
            let client = self.client
            try await Task {
                try await client.revoke(gameID: entry.gameID, pushToken: entry.pushToken, widgetToken: entry.widgetToken)
            }.value
        } catch {
            // Server must cascade widget-token revocation. A 401 already means that bearer
            // is unusable; other failures require an explicit notice, never fake success.
            if error as? WidgetFailure != .signedOut {
                if !pendingRevocations.contains(entry) { pendingRevocations.append(entry) }
                if !retry { onFailure?("실시간 카드 푸시 연결을 해제하지 못했어요. 앱에서 위젯 연결을 다시 확인해 주세요") }
            }
        }
    }
}
