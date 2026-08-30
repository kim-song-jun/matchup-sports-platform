import Foundation
import WebKit

/// Registers and revokes this device with the Teameet API.
///
/// Counterpart of `PushRegistrationClient` on Android. The endpoints are authenticated with
/// the same session cookie the web app uses, so the request has to carry it — and the only
/// place that cookie exists is the web view's data store, not `HTTPCookieStorage`.
/// `WKHTTPCookieStore` hands over `HttpOnly` cookies too, which is what makes this possible
/// without the web app doing anything.
///
/// Only cookies for the configured origin are forwarded. Sending the whole jar would leak a
/// third-party cookie to our own API, and the Kakao authorization page the shell loads in
/// place puts exactly such cookies in that store.
@MainActor
struct PushDeviceClient {

    private let config: AppConfig
    private let cookieStore: WKHTTPCookieStore
    private let session: URLSession

    init(
        config: AppConfig,
        cookieStore: WKHTTPCookieStore = WKWebsiteDataStore.default().httpCookieStore,
        session: URLSession = .shared
    ) {
        self.config = config
        self.cookieStore = cookieStore
        self.session = session
    }

    enum Outcome: Equatable {
        case registered
        /// No session cookie yet, so nobody is logged in. Not an error: the shell tries
        /// again on the next authenticated page load, exactly as Android does.
        case notAuthenticated
        case failed(status: Int)
    }

    func register(_ registration: PushDeviceRegistration) async -> Outcome {
        guard registration.isSendable else { return .failed(status: 0) }
        guard let url = URL(string: config.webOrigin + "/api/v1/notifications/push-devices"),
              let body = registration.jsonBody() else { return .failed(status: 0) }
        guard let cookie = await sessionCookieHeader() else { return .notAuthenticated }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        request.setValue(config.webOrigin, forHTTPHeaderField: "Origin")
        request.httpBody = body
        request.timeoutInterval = 10

        return await send(request)
    }

    func revoke(installationId: UUID) async -> Outcome {
        guard let url = URL(
            string: config.webOrigin + "/api/v1/notifications/push-devices/"
                + installationId.uuidString
        ) else { return .failed(status: 0) }
        guard let cookie = await sessionCookieHeader() else { return .notAuthenticated }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
        request.setValue(config.webOrigin, forHTTPHeaderField: "Origin")
        request.timeoutInterval = 10

        return await send(request)
    }

    private func send(_ request: URLRequest) async -> Outcome {
        do {
            let (_, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (200...299).contains(status) ? .registered : .failed(status: status)
        } catch {
            // Retried on the next authenticated page load or token refresh, matching
            // Android. The device token is never written to a log.
            return .failed(status: 0)
        }
    }

    /// Builds a `Cookie` header from the web view's store, keeping only cookies that belong
    /// to the configured origin's host.
    private func sessionCookieHeader() async -> String? {
        guard let host = AllowedNavigation.parse(config.webOrigin)?.host else { return nil }
        let cookies = await cookieStore.allCookies()
        let mine = cookies.filter { PushCookieScope.matches(domain: $0.domain, host: host) }
        guard !mine.isEmpty else { return nil }
        return mine.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
    }
}
