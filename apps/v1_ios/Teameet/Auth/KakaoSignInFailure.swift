import Foundation

/// One failed Kakao sign-in step, reduced to values that are safe to log.
///
/// The SDK's own `localizedDescription` collapses every failure into the same sentence, and
/// its messages can echo URLs, authorization codes or tokens, so nothing reaches the page
/// except what passes through here.
struct KakaoSignInFailure: Equatable, Sendable {

    enum Step: String, Sendable {
        case talk, account, consent
    }

    /// Upper bound for `report(_:)`.
    static let reportLimit = 300
    private static let detailLimit = 100
    private static let identifierLimit = 48

    let step: Step
    /// `ClientFailed`, `ApiFailed`, `AuthFailed`, `AppsFailed`, or `Other` for a non-SDK error.
    let family: String
    let reason: String
    let detail: String?

    init(step: Step, family: String, reason: String, detail: String? = nil) {
        self.step = step
        self.family = Self.identifier(family)
        self.reason = Self.identifier(reason)
        let cleaned = detail.map { Self.sanitized($0, limit: Self.detailLimit) }
        self.detail = cleaned?.isEmpty == false ? cleaned : nil
    }

    /// The text the page logs as the failure reason.
    ///
    /// Classifications come first and details after, so the leading characters identify every
    /// failed step even where the consumer truncates the value.
    static func report(_ steps: [KakaoSignInFailure]) -> String {
        let classes = steps.map { "\($0.step.rawValue):\($0.family)/\($0.reason)" }.joined(separator: " ")
        let details = steps.compactMap { failure in
            failure.detail.map { "\(failure.step.rawValue): \($0)" }
        }
        return truncated(([classes] + details).joined(separator: " | "), limit: reportLimit)
    }

    // MARK: - Sanitising

    // Applied in order: a URL is removed whole before the narrower patterns look inside it.
    private static let redactions: [(pattern: String, replacement: String)] = [
        (#"[A-Za-z][A-Za-z0-9+.\-]*://\S*"#, "<url>"),
        (#"(?i)\b(access_token|refresh_token|id_token|code_verifier|client_secret|code|token|state)=\S+"#, "$1=<redacted>"),
        (#"(?i)\bbearer\s+\S+"#, "Bearer <redacted>"),
        (#"\?\S*=\S*"#, "?<query>"),
        // Tokens and authorization codes are long unbroken runs; prose is not.
        (#"[A-Za-z0-9_\-.~+/=]{32,}"#, "<redacted>"),
    ]

    static func sanitized(_ raw: String, limit: Int) -> String {
        var text = raw
        for redaction in redactions {
            text = text.replacingOccurrences(
                of: redaction.pattern, with: redaction.replacement, options: .regularExpression)
        }
        let words = text.split(whereSeparator: isSeparator)
        return truncated(words.joined(separator: " "), limit: limit)
    }

    private static func isSeparator(_ character: Character) -> Bool {
        character.isWhitespace || character.isNewline
            || character.unicodeScalars.contains { $0.properties.generalCategory == .control }
    }

    /// Enum case and type names only: anything else becomes `_`.
    private static func identifier(_ raw: String) -> String {
        String(raw.prefix(identifierLimit).map { character in
            character.isASCII && (character.isLetter || character.isNumber || "_.-".contains(character))
                ? character : "_"
        })
    }

    private static func truncated(_ text: String, limit: Int) -> String {
        text.count <= limit ? text : String(text.prefix(limit - 1)) + "…"
    }
}
