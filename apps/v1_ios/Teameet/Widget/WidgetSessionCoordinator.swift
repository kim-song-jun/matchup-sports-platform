import Foundation
import WebKit
import CryptoKit
import WidgetKit

@MainActor
final class WidgetSessionCoordinator: NSObject, WKHTTPCookieStoreObserver {
    private let config: AppConfig
    private let cookies: WKHTTPCookieStore
    private var inFlight: Set<String> = []
    var onFailure: ((String) -> Void)?
    init(config: AppConfig, cookies: WKHTTPCookieStore) {
        self.config = config; self.cookies = cookies
        super.init()
        cookies.add(self)
    }
    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { Task { await synchronize() } }
    func synchronize() async {
        guard let host = URL(string: config.webOrigin)?.host else { return }
        let all = await cookies.allCookies()
        let cookie = all.first { $0.name == PushCookieScope.sessionCookieName && !$0.value.isEmpty
            && PushCookieScope.matches(domain: $0.domain, host: host)
            && ($0.expiresDate == nil || $0.expiresDate! > Date()) }
        let owner = cookie.map { SHA256.hash(data: Data($0.value.utf8)).map { String(format: "%02x", $0) }.joined() }
        do {
            let store = try WidgetStore()
            let api = WidgetAPI()
            let transition = try store.transition(owner: owner)
            if #available(iOS 16.2, *) {
                await MatchActivityCoordinator.shared.sessionChanged(revision: transition.state.revision,
                    signedIn: transition.state.owner != nil && transition.state.token != nil)
            }
            if transition.oldToken != nil || owner == nil { WidgetCenter.shared.reloadAllTimelines() }
            if let old = transition.oldToken {
                do { try await api.revoke(token: old) }
                catch {
                    if error as? WidgetFailure != .signedOut { onFailure?("이 기기의 위젯 토큰을 서버에서 폐기하지 못했어요. 설정에서 전체 위젯 토큰을 해제해 주세요") }
                }
            }
            guard let cookie, let owner else { return }
            var state = try store.read()
            guard state.owner == owner, !inFlight.contains(state.revision) else { return }
            let revision = state.revision
            inFlight.insert(revision)
            defer { inFlight.remove(revision) }
            if state.token == nil {
                guard state.attemptedAt < 0 || WidgetFormat.now - state.attemptedAt >= 600_000 else { return }
                guard try store.update(revision: revision, { $0.attemptedAt = WidgetFormat.now }) else { return }
                let token = try await api.mint(cookie: HTTPCookie.requestHeaderFields(with: [cookie])["Cookie"] ?? "")
                guard try store.update(revision: revision, { $0.token = token }) else {
                    // A logout/account switch during issuance must not leave a new token alive.
                    try await api.revoke(token: token)
                    return
                }
                state = try store.read()
            }
            guard state.revision == revision else { return }
            // Successful refreshes are 5 minutes apart; failed ones 1 minute, so offline browsing neither hammers the API nor nags.
            let now = WidgetFormat.now
            guard state.updatedAt < 0 || now - state.updatedAt >= 300_000, state.refreshAttemptedAt < 0 || now - state.refreshAttemptedAt >= 60_000 else { return }
            guard try store.update(revision: revision, { $0.refreshAttemptedAt = now }) else { return }
            let snapshot = await WidgetService(store: store, api: api).refresh()
            if #available(iOS 16.2, *) { MatchActivityCoordinator.shared.observed(snapshot) }
            if let model = snapshot.model {
                await WidgetLogos.prefetch(model: model, store: store, revision: revision, environment: api.environment)
            }
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            // The widget itself shows "업데이트 지연" / sign-in guidance; only a failed revoke (above) needs the user to act.
        }
    }
}
