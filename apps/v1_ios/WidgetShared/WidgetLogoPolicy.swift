import Foundation

/// Preserve the API's display priority instead of truncating an unordered Set.
enum WidgetLogoPolicy {
    static let extensionLimit = 4
    static let timeout: Duration = .seconds(8)
    static func paths(model: WidgetModel, limit: Int, cached: (String) -> Bool) -> [String] {
        let candidates = model.live.flatMap { [$0.teamLogoUrl, $0.opponentLogoUrl] }
            + (model.pending + model.schedules).flatMap { [$0.teamLogoUrl, $0.opponentLogoUrl] }
        var seen = Set<String>()
        return Array(candidates.compactMap { $0 }.filter {
            seen.insert($0).inserted && !$0.isEmpty && !cached($0)
        }.prefix(max(0, min(20, limit))))
    }
}

/// A request timeout alone resets while bytes arrive. This deadline bounds the whole batch.
enum WidgetFetchBudget {
    static func run(timeout: Duration, cancel: @escaping @Sendable () -> Void,
                    operation: @escaping @Sendable () async -> Void) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await operation() }
            group.addTask {
                do { try await Task.sleep(for: timeout) } catch { return }
                cancel()
            }
            _ = await group.next()
            group.cancelAll()
            cancel()
        }
    }
}
