import CryptoKit
import Foundation

/// Remembers which (token, session) pair the server already holds, so `register()` can be
/// called on every page load without producing a request on every page load.
///
/// The shell re-runs registration on each in-page navigation because that is the only way
/// to catch a sign-in, which is a client-side transition. Without this ledger every route
/// change posted a fresh registration — three in one second was measured — against an
/// endpoint limited to ten a minute, and the eleventh came back 429. The coordinator then
/// recorded the device as unregistered, and the settings switch showed off for a device the
/// server still had.
struct PushRegistrationLedger: Equatable {

    private(set) var registeredFingerprint: String?

    /// Whether the server needs to hear about this pair. A different session means a
    /// different account, which is exactly the case that must re-register.
    func needsRegistration(for fingerprint: String) -> Bool {
        registeredFingerprint != fingerprint
    }

    mutating func recordRegistered(_ fingerprint: String) {
        registeredFingerprint = fingerprint
    }

    mutating func clear() {
        registeredFingerprint = nil
    }

    /// Hashed so the session cookie's value is not held in memory beyond the request that
    /// needs it.
    static func fingerprint(token: Data, session: String) -> String {
        var hasher = SHA256()
        hasher.update(data: token)
        hasher.update(data: Data("\n".utf8))
        hasher.update(data: Data(session.utf8))
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
