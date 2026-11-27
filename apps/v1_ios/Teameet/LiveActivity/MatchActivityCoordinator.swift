import ActivityKit
import Foundation
import UIKit
import os

/// Local-only PR-C lifecycle. Background time is opportunistic; remote start/push is PR-D.
@available(iOS 16.2, *)
@MainActor
final class MatchActivityCoordinator {
    static let shared = MatchActivityCoordinator()
    private let defaults: UserDefaults
    private let key = "teameet.match-activities.v1"
    private var ledger: MatchActivityLedger
    private var loop: Task<Void, Never>?
    private var observers: [String: Task<Void, Never>] = [:]
    private var finals: [String: Activity<MatchActivityAttributes>] = [:]
    private var refreshing = false
    private var foreground = false
    private var backgroundTask: Task<Void, Never>?
    private var backgroundID: UIBackgroundTaskIdentifier = .invalid
    private var sessionGeneration = 0
    private var sessionRevision: String?
    private let logger = Logger(subsystem: "kr.co.teameet", category: "LiveActivity")
    var onFailure: ((String) -> Void)?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: key) {
            do { ledger = try JSONDecoder().decode(MatchActivityLedger.self, from: data) }
            catch {
                // Fail closed: do not lose a user's dismissal decision on corrupt storage.
                ledger = MatchActivityLedger()
                storageHealthy = false
            }
        } else { ledger = MatchActivityLedger() }
    }
    private var storageHealthy = true
    private func save() {
        do {
            let data = try JSONEncoder().encode(ledger)
            if defaults.data(forKey: key) != data {
                defaults.set(data, forKey: key)
                if !defaults.synchronize() { storageHealthy = false; report("실시간 카드 설정을 저장하지 못했어요") }
            }
        }
        catch { storageHealthy = false; report("실시간 카드 설정을 저장하지 못했어요") }
    }
    private func report(_ message: String) {
        logger.error("\(message, privacy: .public)")
        onFailure?(message)
    }
    func setForeground(_ active: Bool) {
        foreground = active
        let previous = loop
        previous?.cancel(); loop = nil
        if active {
            backgroundTask?.cancel(); finishBackground()
            loop = Task { [weak self] in
                while !Task.isCancelled {
                    await self?.refresh(allowStart: true)
                    do { try await Task.sleep(for: .seconds(30)) } catch { return }
                }
            }
        } else { beginBackgroundRefresh(after: previous) }
    }
    private func beginBackgroundRefresh(after previous: Task<Void, Never>?) {
        guard backgroundID == .invalid, !allActivities.isEmpty else { return }
        backgroundID = UIApplication.shared.beginBackgroundTask(withName: "MatchActivityRefresh") { [weak self] in
            Task { @MainActor in self?.backgroundTask?.cancel(); self?.finishBackground() }
        }
        guard backgroundID != .invalid else { return }
        backgroundTask = Task { [weak self] in
            await previous?.value
            guard !Task.isCancelled else { self?.finishBackground(); return }
            await self?.refresh(allowStart: false)
            self?.finishBackground()
        }
    }
    private func finishBackground() {
        guard backgroundID != .invalid else { return }
        let id = backgroundID; backgroundID = .invalid
        UIApplication.shared.endBackgroundTask(id)
    }
    /// Called immediately after cookie transition, before token revocation can await a network.
    func sessionChanged(revision: String, signedIn: Bool) async {
        if sessionRevision != revision || !signedIn { sessionGeneration += 1 }
        sessionRevision = signedIn ? revision : nil
        for activity in allActivities where !signedIn || activity.attributes.revision != revision {
            await remove(activity)
        }
    }
    private var allActivities: [Activity<MatchActivityAttributes>] {
        var activities = Dictionary(uniqueKeysWithValues: Activity<MatchActivityAttributes>.activities.map { ($0.id, $0) })
        for (id, activity) in finals { activities[id] = activity }
        return Array(activities.values)
    }
    private func observe(_ activity: Activity<MatchActivityAttributes>) {
        guard observers[activity.id] == nil else { return }
        observers[activity.id] = Task { [weak self] in
            for await state in activity.activityStateUpdates {
                guard !Task.isCancelled, let self else { return }
                if state == .dismissed {
                    self.ledger.recordDismissal(activityID: activity.id)
                    self.save()
                    self.observers[activity.id] = nil
                    return
                }
            }
        }
    }
    private func remove(_ activity: Activity<MatchActivityAttributes>) async {
        observers.removeValue(forKey: activity.id)?.cancel()
        if activity.activityState == .dismissed { ledger.recordDismissal(activityID: activity.id) }
        else { ledger.tracked.removeValue(forKey: activity.id) }
        finals.removeValue(forKey: activity.id)
        save()
        await MatchActivityCommands.end(id: activity.id)
    }
    func refresh(allowStart: Bool) async {
        guard !refreshing else { return }
        refreshing = true
        defer { refreshing = false }
        let generation = sessionGeneration
        do {
            let store = try WidgetStore()
            let initial = try store.read()
            guard initial.token != nil, initial.owner != nil else {
                await sessionChanged(revision: initial.revision, signedIn: false)
                return
            }
            if !ActivityAuthorizationInfo().areActivitiesEnabled {
                for activity in allActivities { await remove(activity) }
                return
            }
            let activities = allActivities
            let present = Set(activities.map(\.id))
            // State updates may have been missed while suspended or after process termination.
            for id in Array(ledger.tracked.keys) where !present.contains(id) { ledger.recordDismissal(activityID: id) }
            save()
            for activity in activities where activity.attributes.revision == initial.revision
                && (activity.activityState == .active || activity.activityState == .stale) {
                if ledger.tracked[activity.id] == nil {
                    ledger.tracked[activity.id] = .init(gameID: activity.attributes.gameID, revision: initial.revision)
                }
            }
            save()
            for activity in activities where ledger.tracked[activity.id] != nil {
                if activity.activityState == .dismissed || activity.activityState == .ended { ledger.recordDismissal(activityID: activity.id); save() }
                else { observe(activity) }
            }
            guard storageHealthy else { report("실시간 카드 설정을 읽지 못했어요. 자동 시작을 보류했어요"); return }
            let snapshot = await WidgetService(store: store, api: WidgetAPI()).refresh()
            let current = try store.read()
            guard generation == sessionGeneration, current.revision == initial.revision,
                  current.token != nil, current.owner != nil else {
                await sessionChanged(revision: current.revision, signedIn: current.token != nil && current.owner != nil)
                return
            }
            // Existing content becomes stale on its own. Never refresh its date from an offline cache.
            guard !snapshot.stale, let model = snapshot.model, let game = MatchActivityLedger.selected(in: model) else {
                if snapshot.model != nil && !snapshot.stale {
                    for activity in allActivities where activity.activityState != .ended { await remove(activity) }
                }
                return
            }
            // Persist the first observation BEFORE any further suspension (including logo IO).
            // Terminating the app during a download must not restart the fifteen-minute window.
            let finalDeadline: Int64?
            if game.state == "ENDED" {
                finalDeadline = ledger.endDeadline(gameID: game.gameId, now: snapshot.updatedAt)
                save()
            } else { finalDeadline = nil }
            for activity in allActivities where activity.attributes.revision != current.revision || activity.attributes.gameID != game.gameId {
                await remove(activity)
            }
            await WidgetLogos.prefetch(model: WidgetModel(live: [game]), store: store,
                                       revision: current.revision, environment: .current, maxCount: 2)
            guard !Task.isCancelled, generation == sessionGeneration,
                  try store.read().revision == current.revision else { return }
            var state = MatchActivityState(game: game, now: snapshot.updatedAt)
            state.teamLogoKey = game.teamLogoUrl.map(WidgetLogos.key)
            state.opponentLogoKey = game.opponentLogoUrl.map(WidgetLogos.key)
            let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(60))
            if game.state != "ENDED" {
                // A server-resumed game replaces the old final card, not a user's dismissal.
                for old in allActivities where old.attributes.gameID == game.gameId && old.activityState == .ended {
                    await remove(old)
                }
            }
            let activity = allActivities.first { $0.attributes.gameID == game.gameId && $0.attributes.revision == current.revision }
            if game.state == "ENDED" {
                guard let deadline = finalDeadline else { return }
                if let activity {
                    observers.removeValue(forKey: activity.id)?.cancel()
                    ledger.tracked.removeValue(forKey: activity.id)
                    save()
                    finals[activity.id] = activity
                    // End once. Reopening the app cannot extend this fixed date.
                    if activity.activityState != .ended {
                        await MatchActivityCommands.end(id: activity.id, state: state,
                            dismissalDate: deadline <= WidgetFormat.now ? nil : WidgetFormat.date(deadline))
                    } else if deadline <= WidgetFormat.now { await remove(activity) }
                }
                return
            }
            if let activity, activity.activityState == .active || activity.activityState == .stale {
                await MatchActivityCommands.update(id: activity.id, state: content.state, staleDate: content.staleDate)
            } else if allowStart && foreground && UIApplication.shared.applicationState == .active
                        && ActivityAuthorizationInfo().areActivitiesEnabled && ledger.mayStart(game) {
                do {
                    guard !Task.isCancelled, generation == sessionGeneration,
                          try store.read().revision == current.revision else { return }
                    let created = try Activity.request(attributes: MatchActivityAttributes(gameID: game.gameId, revision: current.revision),
                                                       content: content, pushType: nil)
                    ledger.tracked[created.id] = .init(gameID: game.gameId, revision: current.revision)
                    save()
                    if storageHealthy { observe(created) }
                    else { await remove(created) }
                } catch { report("실시간 카드를 시작하지 못했어요. 시스템 설정을 확인해 주세요") }
            }
        } catch { if !Task.isCancelled { report("실시간 카드 정보를 불러오지 못했어요") } }
    }
}
