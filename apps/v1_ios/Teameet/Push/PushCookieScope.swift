import Foundation

/// Decides which of the web view's cookies may travel to the Teameet API.
///
/// The shell reads cookies out of `WKHTTPCookieStore`, which holds everything the web view
/// has collected — including cookies from the Kakao authorization page it loads in place.
/// Forwarding the whole jar would hand a third party's cookies to our own API, so only
/// cookies scoped to the configured origin's host are sent.
///
/// Kept apart from WebKit so the boundary case can be tested: a cookie domain may be the
/// host itself or a dot-prefixed parent of it, and a plain suffix comparison would also
/// accept `evilalpha.teameet.co.kr` as a match for `alpha.teameet.co.kr`.
enum PushCookieScope {

    /// The cookie the API issues on sign-in. It is the only one that means "there is an
    /// account here" — the origin also sets cookies for a signed-out visitor (consent,
    /// analytics), so "has any cookie for our host" answers a different question.
    ///
    /// Measured: treating any origin cookie as a session showed the notification explainer to
    /// a signed-out reader, which is the one case it must not appear in.
    ///
    /// If the API ever renames this, the shell stops offering the explainer rather than
    /// offering it at the wrong time — and `testCTheShellAsksAboutNotificationsOnceSignedIn`
    /// fails, which is where that would be noticed.
    static let sessionCookieName = "teameet_v1_session"

    /// Whether these cookies show a signed-in reader on the given host.
    static func hasSession(cookies: [(name: String, domain: String)], host: String) -> Bool {
        cookies.contains { $0.name == sessionCookieName && matches(domain: $0.domain, host: host) }
    }

    static func matches(domain: String, host: String) -> Bool {
        guard !domain.isEmpty, !host.isEmpty else { return false }
        let normalised = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
        guard !normalised.isEmpty else { return false }
        if normalised.caseInsensitiveCompare(host) == .orderedSame { return true }
        // Only a dot-prefixed domain covers subdomains, and the match has to fall on a
        // label boundary.
        guard domain.hasPrefix(".") else { return false }
        return host.lowercased().hasSuffix("." + normalised.lowercased())
    }
}
