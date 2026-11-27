import Foundation
import Darwin

/// One encoded value in App Group defaults. A cross-process file lock and session revision
/// make read/modify/write atomic across the shell, provider and App Intent processes.
struct WidgetStore: Sendable {
    struct State: Codable, Sendable {
        var revision = UUID().uuidString
        var owner: String?
        var token: String?
        var model: WidgetModel?
        var updatedAt: Int64 = -1
        var notice: String?
        var attemptedAt: Int64 = -1
        var refreshAttemptedAt: Int64 = -1
    }
    static let cacheLifetime: Int64 = 3 * 60 * 60 * 1000
    let group: String
    let directory: URL
    init(environment: WidgetEnvironment = .current) throws {
        guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: environment.group) else {
            throw WidgetFailure.invalidResponse
        }
        self.init(group: environment.group, directory: directory)
    }
    init(group: String, directory: URL) { self.group = group; self.directory = directory }
    private func transaction<T>(_ change: (inout State) throws -> T) throws -> T {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let fd = open(directory.appendingPathComponent("widget.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw WidgetFailure.invalidResponse }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw WidgetFailure.invalidResponse }
        defer { flock(fd, LOCK_UN) }
        guard let defaults = UserDefaults(suiteName: group) else { throw WidgetFailure.invalidResponse }
        defaults.synchronize()
        var state = State()
        if let data = defaults.data(forKey: "widget.state.v1") { state = try JSONDecoder().decode(State.self, from: data) }
        let result = try change(&state)
        defaults.set(try JSONEncoder().encode(state), forKey: "widget.state.v1")
        guard defaults.synchronize() else { throw WidgetFailure.invalidResponse }
        return result
    }
    func read() throws -> State { try transaction { $0 } }
    @discardableResult
    func update(revision: String, _ change: (inout State) throws -> Void) throws -> Bool {
        try transaction { state in
            guard state.revision == revision else { return false }
            try change(&state)
            return true
        }
    }
    func transition(owner: String?) throws -> (state: State, oldToken: String?) {
        try transaction { state in
            guard state.owner != owner else { return (state, nil) }
            let token = state.token
            state = State(owner: owner)
            try removeLogos()
            return (state, token)
        }
    }
    func invalidate(revision: String) throws {
        _ = try update(revision: revision) { state in
            // Keep the owner fingerprint: the app can reissue after a 401, but never show
            // another account's cached data while doing so.
            state = State(owner: state.owner)
            try removeLogos()
        }
    }
    private func removeLogos() throws {
        let path = directory.appendingPathComponent("logos")
        if FileManager.default.fileExists(atPath: path.path) { try FileManager.default.removeItem(at: path) }
    }
    static func usable(_ state: State, now: Int64) -> Bool {
        state.token != nil && state.model != nil && state.updatedAt >= 0 && now >= state.updatedAt && now - state.updatedAt < cacheLifetime
    }
}

struct WidgetSnapshot: Sendable {
    var model: WidgetModel?
    var notice: String?
    var updatedAt: Int64 = -1
    var stale = false
    var revision = ""
}
struct WidgetService: Sendable {
    let store: WidgetStore
    let api: WidgetAPI
    func refresh() async -> WidgetSnapshot {
        do {
            let state = try store.read()
            guard let token = state.token else { return WidgetSnapshot(notice: WidgetFailure.signedOut.localizedDescription) }
            do {
                let model = try await api.home(token: token)
                let now = WidgetFormat.now
                guard try store.update(revision: state.revision, { $0.model = model; $0.updatedAt = now; $0.notice = nil }) else {
                    return WidgetSnapshot(notice: WidgetFailure.changedSession.localizedDescription)
                }
                return WidgetSnapshot(model: model, updatedAt: now, revision: state.revision)
            } catch {
                if error as? WidgetFailure == .signedOut {
                    try store.invalidate(revision: state.revision)
                    return WidgetSnapshot(notice: WidgetFailure.signedOut.localizedDescription)
                }
                let message = (error as? WidgetFailure)?.localizedDescription ?? WidgetFailure.invalidResponse.localizedDescription
                guard let current = try? store.read(), current.revision == state.revision else {
                    return WidgetSnapshot(notice: WidgetFailure.changedSession.localizedDescription)
                }
                return WidgetSnapshot(model: WidgetStore.usable(current, now: WidgetFormat.now) ? current.model : nil,
                                      notice: current.notice ?? message, updatedAt: current.updatedAt, stale: true, revision: current.revision)
            }
        } catch { return WidgetSnapshot(notice: WidgetFailure.invalidResponse.localizedDescription) }
    }
    func respond(id: String, going: Bool, revision: String) async throws {
        let state = try store.read()
        guard state.revision == revision, let token = state.token else { throw WidgetFailure.changedSession }
        guard WidgetStore.usable(state, now: WidgetFormat.now),
              (state.model!.pending + state.model!.schedules).contains(where: { $0.scheduleId == id && $0.isRespondable(at: WidgetFormat.now) })
        else { throw WidgetFailure.invalidResponse }
        do {
            let saved = try await api.attendance(id: id, going: going, token: token)
            // Already saved on the server: keep the cache and show the answer now, so a failed refresh below cannot blank the widget.
            guard try store.update(revision: revision, { $0.model = $0.model?.answered(id, status: saved); $0.notice = nil }) else { throw WidgetFailure.changedSession }
            _ = await refresh()
        } catch {
            if error as? WidgetFailure == .signedOut { try store.invalidate(revision: revision) }
            else {
                let message = (error as? WidgetFailure)?.localizedDescription ?? WidgetFailure.transport.localizedDescription
                _ = try store.update(revision: revision) { $0.notice = message }
            }
            throw error
        }
    }
}
