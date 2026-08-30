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
