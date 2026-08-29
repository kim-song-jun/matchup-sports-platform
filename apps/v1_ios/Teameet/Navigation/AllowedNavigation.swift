import Foundation

/// Origin allowlist for the WebView shell.
///
/// This is the iOS port of `kr.co.teameet.AllowedNavigation`
/// (`apps/v1_android/app/src/main/java/kr/co/teameet/AllowedNavigation.java`). Both
/// platforms must reach the same verdict for the same URL: a navigation that Android
/// keeps inside the shell must stay inside on iOS, and one Android pushes to the browser
/// must leave on iOS too.
///
/// ## Why this does not use `URL` / `URLComponents`
///
/// Android parses with `java.net.URI`, which **throws** on a raw character that RFC 2396
/// excludes — a space, a control character, or one of `" < > { } | \ ^ ` `. The Java
/// allowlist catches that throw and fails closed. Foundation's parser on this toolchain
/// (Swift 6.3.3 / Xcode 26.6) is a lenient RFC 3986 parser that never returns `nil` for
/// those inputs; it silently percent-encodes them. Measured, not assumed: a naive
/// `URLComponents`-based port answers `true` for
/// `https://alpha.teameet.co.kr/<inject>` and for paths carrying a raw NUL or tab, where
/// Android answers `false`. A naive port therefore fails **open** exactly where the Java
/// original fails closed.
///
/// So the parsing below replicates `java.net.URI`'s own two-stage algorithm instead:
/// reject the strings Java refuses, then split with the capturing regex `java.net.URI`
/// documents (RFC 2396 Appendix B).
///
/// `\` matters most in that excluded set. WebKit and several other parsers treat a
/// backslash in the authority like `/`, so `https://alpha.teameet.co.kr\@attacker.example`
/// is a classic origin-confusion payload. Java rejects it outright; this port must too.
///
/// ## Round-tripping a parsed `URL`
///
/// `isInternal(_ url:origin:)` stringifies and re-parses, which mirrors Android exactly:
/// `MainActivity` receives an already-parsed `android.net.Uri` from the WebView and
/// `AllowedNavigation.isInternal` calls `toString()` before handing it to `java.net.URI`.
/// Keeping the same round-trip keeps the two platforms on one code path rather than
/// giving iOS a second, subtly different judgement.
enum AllowedNavigation {

    // MARK: - java.net.URI-compatible parsing

    /// The components `java.net.URI` exposes, with its `-1`-means-absent port modelled as
    /// `nil` so a missing port can never be conflated with an explicit default one.
    struct ParsedURI: Equatable {
        let scheme: String?
        let userInfo: String?
        let host: String?
        /// `nil` mirrors `java.net.URI.getPort() == -1`. An explicit `:443` is `443`, and
        /// `443 != nil`, so an explicit default port does not match an implicit one.
        let port: Int?
        let path: String
        let query: String?
        let fragment: String?

        /// Mirrors `java.net.URI.isAbsolute()`.
        var isAbsolute: Bool { scheme != nil }
    }

    /// US-ASCII characters `java.net.URI` accepts unescaped: RFC 2396 `unreserved`
    /// (`ALPHA DIGIT - _ . ! ~ * ' ( )`) plus `reserved` (`; / ? : @ & = + $ , [ ]`) plus
    /// the `%` escape marker and the `#` fragment delimiter.
    ///
    /// Everything else in US-ASCII — space, control characters, and
    /// `" < > { } | \ ^ ` ` — is excluded, which is what makes `URI.create` throw.
    private static let legalAsciiScalars: Set<Unicode.Scalar> = {
        var legal = Set<Unicode.Scalar>()
        for value in UInt8(ascii: "A")...UInt8(ascii: "Z") { legal.insert(Unicode.Scalar(value)) }
        for value in UInt8(ascii: "a")...UInt8(ascii: "z") { legal.insert(Unicode.Scalar(value)) }
        for value in UInt8(ascii: "0")...UInt8(ascii: "9") { legal.insert(Unicode.Scalar(value)) }
        for scalar in "-_.!~*'();/?:@&=+$,[]%#".unicodeScalars { legal.insert(scalar) }
        return legal
    }()

    /// `java.net.URI` admits any non-US-ASCII character except those its javadoc calls out
    /// as excluded: control characters (`Character.isISOControl`) and space characters
    /// (`Character.isSpaceChar` — the Unicode separator categories).
    ///
    /// Rejecting the separators matters. `Character.isSpaceChar` covers U+00A0 and the
    /// other Unicode spaces, so a Swift port that only rejected ASCII space would accept
    /// input Android refuses.
    private static func isLegalNonAsciiScalar(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.properties.generalCategory {
        case .control, .spaceSeparator, .lineSeparator, .paragraphSeparator:
            return false
        default:
            return true
        }
    }

    /// `java.net.URI`'s own capturing regex, quoted from its javadoc (RFC 2396 Appendix B):
    /// `^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$`
    ///
    /// Group indices are 1-based with group 0 as the whole match, so scheme is group 2
    /// (group 1 still carries the trailing colon), authority is group 4, path is group 5,
    /// query is group 7 and fragment is group 9.
    private static let uriPattern: NSRegularExpression = {
        // The pattern is a compile-time constant, so this cannot fail at runtime.
        // swiftlint:disable:next force_try
        try! NSRegularExpression(pattern: #"^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$"#)
    }()

    /// Returns `nil` in exactly the cases where `java.net.URI.create(candidate)` throws
    /// `IllegalArgumentException`, which the Java allowlist turns into a rejection.
    static func parse(_ candidate: String) -> ParsedURI? {
        guard containsOnlyLegalCharacters(candidate), hasWellFormedEscapes(candidate) else { return nil }

        let text = candidate as NSString
        guard let match = uriPattern.firstMatch(
            in: candidate,
            range: NSRange(location: 0, length: text.length)
        ) else { return nil }

        func group(_ index: Int) -> String? {
            let range = match.range(at: index)
            return range.location == NSNotFound ? nil : text.substring(with: range)
        }

        guard let authority = group(4) else {
            return ParsedURI(
                scheme: group(2),
                userInfo: nil,
                host: nil,
                port: nil,
                path: group(5) ?? "",
                query: group(7),
                fragment: group(9)
            )
        }

        guard let split = splitAuthority(authority) else { return nil }
        return ParsedURI(
            scheme: group(2),
            userInfo: split.userInfo,
            host: split.host,
            port: split.port,
            path: group(5) ?? "",
            query: group(7),
            fragment: group(9)
        )
    }

    private static func containsOnlyLegalCharacters(_ candidate: String) -> Bool {
        for scalar in candidate.unicodeScalars {
            if scalar.isASCII {
                if !legalAsciiScalars.contains(scalar) { return false }
            } else if !isLegalNonAsciiScalar(scalar) {
                return false
            }
        }
        return true
    }

    /// `java.net.URI` requires every `%` to introduce a two-hex-digit escape, so `100%`
    /// and `%zz` throw. Without this check the port would silently accept input Android
    /// rejects.
    private static func hasWellFormedEscapes(_ candidate: String) -> Bool {
        let scalars = Array(candidate.unicodeScalars)
        var index = 0
        while index < scalars.count {
            guard scalars[index] == "%" else {
                index += 1
                continue
            }
            guard index + 2 < scalars.count,
                  isHexDigit(scalars[index + 1]),
                  isHexDigit(scalars[index + 2]) else { return false }
            index += 3
        }
        return true
    }

    private static func isHexDigit(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar {
        case "0"..."9", "a"..."f", "A"..."F": return true
        default: return false
        }
    }

    private struct Authority {
        let userInfo: String?
        let host: String?
        let port: Int?
    }

    /// Splits `userinfo@host:port`, keeping `java.net.URI`'s conventions: the last `@`
    /// separates user info, an empty authority or empty host is absent, and an empty or
    /// missing port reads as absent rather than as the scheme's default.
    private static func splitAuthority(_ authority: String) -> Authority? {
        guard !authority.isEmpty else { return Authority(userInfo: nil, host: nil, port: nil) }

        var userInfo: String?
        var remainder = Substring(authority)
        if let separator = remainder.range(of: "@", options: .backwards) {
            userInfo = String(remainder[remainder.startIndex..<separator.lowerBound])
            remainder = remainder[separator.upperBound...]
        }

        var host: String?
        var port: Int?

        if remainder.hasPrefix("[") {
            // RFC 2732 IPv6 literal, for example `[::1]:8443`.
            guard let closing = remainder.range(of: "]") else { return nil }
            host = String(remainder[remainder.startIndex...closing.lowerBound])
            let trailing = remainder[closing.upperBound...]
            if trailing.hasPrefix(":") {
                guard case .valid(let parsed) = parsePort(String(trailing.dropFirst())) else { return nil }
                port = parsed
            } else if !trailing.isEmpty {
                return nil
            }
        } else if let separator = remainder.range(of: ":", options: .backwards) {
            host = String(remainder[remainder.startIndex..<separator.lowerBound])
            guard case .valid(let parsed) = parsePort(String(remainder[separator.upperBound...])) else { return nil }
            port = parsed
        } else {
            host = String(remainder)
        }

        if host?.isEmpty == true { host = nil }
        return Authority(userInfo: userInfo, host: host, port: port)
    }

    private enum PortParse {
        /// A well-formed port. `nil` covers the empty `host:` form, which `java.net.URI`
        /// reports as `-1` — absent, not the scheme's default.
        case valid(Int?)
        /// Non-numeric, which `java.net.URI` rejects outright.
        case malformed
    }

    private static func parsePort(_ text: String) -> PortParse {
        if text.isEmpty { return .valid(nil) }
        guard text.allSatisfy({ $0.isASCII && $0.isNumber }), let value = Int(text) else { return .malformed }
        return .valid(value)
    }

    // MARK: - Internal origin

    /// Whether the shell should load `url` itself rather than hand it to the system.
    static func isInternal(_ url: URL?, origin: String) -> Bool {
        guard let url else { return false }
        return isInternalAbsoluteUrl(url.absoluteString, origin: origin)
    }

    /// Same-origin test against `origin`: HTTPS only, exactly the same host, exactly the
    /// same port, and no embedded credentials.
    static func isInternalAbsoluteUrl(_ candidate: String?, origin: String) -> Bool {
        guard let candidate,
              let target = parse(candidate),
              let expected = parse(origin) else { return false }
        guard let scheme = target.scheme,
              scheme.caseInsensitiveCompare("https") == .orderedSame else { return false }
        guard let expectedHost = expected.host,
              let host = target.host,
              expectedHost.caseInsensitiveCompare(host) == .orderedSame else { return false }
        // `nil != 443`, so `https://host:443` does not pass as `https://host`. Android
        // draws the same line, and matching it keeps an explicit-port URL from taking a
        // different path on the two platforms.
        guard target.port == expected.port else { return false }
        return target.userInfo == nil
    }

    // MARK: - Trusted auth provider

    /// Kakao's authorization host is the one third-party origin the shell keeps inside the
    /// WebView; handing the login redirect to Safari would strand the session outside it.
    static func isTrustedAuthProvider(_ url: URL?) -> Bool {
        guard let url else { return false }
        return isTrustedAuthProvider(url.absoluteString)
    }

    static func isTrustedAuthProvider(_ candidate: String?) -> Bool {
        guard let candidate, let target = parse(candidate) else { return false }
        guard let scheme = target.scheme,
              scheme.caseInsensitiveCompare("https") == .orderedSame else { return false }
        guard let host = target.host,
              host.caseInsensitiveCompare("kauth.kakao.com") == .orderedSame else { return false }
        guard target.port == nil else { return false }
        return target.userInfo == nil
    }

    // MARK: - External schemes

    /// Schemes the shell will hand to `UIApplication.open`.
    ///
    /// This mirrors Android's reviewed list with two platform substitutions: `market:` is
    /// Play-only and becomes `itms-apps:`, and `intent:` has no iOS counterpart at all, so
    /// it is left out rather than carried over as a dead entry.
    private static let allowedExternalSchemes: Set<String> = [
        "http", "https", "mailto", "tel", "sms", "geo", "itms-apps",
    ]

    static func isAllowedExternal(_ url: URL?) -> Bool {
        isAllowedExternalScheme(url?.scheme)
    }

    static func isAllowedExternalScheme(_ scheme: String?) -> Bool {
        guard let scheme else { return false }
        return allowedExternalSchemes.contains(scheme.lowercased())
    }
}
