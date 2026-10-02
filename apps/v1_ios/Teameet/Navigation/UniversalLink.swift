import Foundation

/// Turns an incoming universal link into a route this shell may open.
///
/// The reason this exists is the Kakao sign-in redirect. `AllowedNavigation` sends
/// `kauth.kakao.com` — and the `accounts.kakao.com` page it redirects to — out to Safari,
/// which is correct for a third-party authorization page but means the redirect back to
/// `https://<origin>/callback/kakao` also lands in Safari. The reader signs in and ends up
/// with a session in the wrong browser. A universal link brings that last hop back into the
/// app, where the shell's cookie store is.
///
/// Kept free of UIKit so the matching rule can be tested. That matters more than it looks:
/// iOS hands the app whatever URL the association file claimed, so a build whose
/// `TEAMEET_WEB_ORIGIN` was mangled must decline rather than load a foreign page into the
/// shell — the shell's cookie jar holds the reader's session.
enum UniversalLink {

    /// The route to open, or `nil` when the link is not ours.
    ///
    /// `nil` is not a failure: returning it lets the system fall back to opening the link
    /// in Safari, which is the right outcome for a URL this shell has no business rendering.
    static func route(for url: URL, origin: String) -> String? {
        guard let scheme = url.scheme, let host = url.host else { return nil }
        // Same rule the message bridge applies to a frame that wants to talk to the shell,
        // including its check that the configured origin itself is a plausible https origin.
        guard NativeBridge.matchesOrigin(
            scheme: scheme, host: host, port: url.port ?? 0, expectedOrigin: origin
        ) else { return nil }
        guard url.user == nil, url.password == nil else { return nil }

        var route = url.path.isEmpty ? "/" : url.path
        if let query = url.query, !query.isEmpty { route += "?" + query }
        if let fragment = url.fragment, !fragment.isEmpty { route += "#" + fragment }

        // The last guard is the one the push path already uses, so a link and a
        // notification cannot open different sets of destinations.
        let safe = DeepLinkRoute.safeRoute(route)
        return safe == DeepLinkRoute.fallback && route != DeepLinkRoute.fallback ? nil : safe
    }
}
