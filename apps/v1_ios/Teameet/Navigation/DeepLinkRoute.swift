import Foundation

/// Sanitiser for the route a push notification asks the shell to open.
///
/// iOS port of `AllowedNavigation.safeRoute`
/// (`apps/v1_android/app/src/main/java/kr/co/teameet/AllowedNavigation.java`).
///
/// The route arrives in the notification payload the API builds, so it is attacker-
/// influenced in the same way any server-relayed string is: whatever ends up here is
/// concatenated onto `WEB_ORIGIN` and loaded. Anything that could steer that load off the
/// origin — an absolute URL, a protocol-relative `//host` reference, embedded credentials
/// — is discarded in favour of the notification list, which is always a valid destination.
///
/// Parsing reuses `AllowedNavigation.parse`, so a route is rejected in exactly the cases
/// where `java.net.URI.create` throws and Android falls back too.
enum DeepLinkRoute {

    /// Where a rejected or missing route lands. The notification list is the one screen
    /// that is meaningful for any push, so a tap never dead-ends.
    static let fallback = "/notifications"

    static func safeRoute(_ candidate: String?) -> String {
        // Android runs these three string checks before it ever calls URI.create, and the
        // order is load-bearing: `""`, `"notifications"` and `"https://attacker.example/x"`
        // are rejected here and never reach the parser. Reordering would push them through
        // a parser whose leniency differs from Java's and quietly widen what is accepted.
        guard let candidate,
              candidate.hasPrefix("/"),
              !candidate.hasPrefix("//") else { return fallback }

        guard let parsed = AllowedNavigation.parse(candidate) else { return fallback }
        guard !parsed.isAbsolute, parsed.host == nil, parsed.userInfo == nil else { return fallback }
        return candidate
    }
}
