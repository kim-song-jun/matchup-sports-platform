import CryptoKit
import Foundation

/// The one transformation the Apple sign-in nonce goes through on this side.
///
/// Apple echoes back **verbatim** whatever string the authorization request carried, and the
/// server compares that against `SHA256(raw nonce)` in lower-case hex. So the request must
/// carry the hash: send the raw value and the server ends up comparing a hash to a plaintext
/// and refuses every sign-in, with a message that says nothing about why.
///
/// Kept apart from `AppleSignInController` so it can be tested — the controller imports
/// UIKit and AuthenticationServices, which the offline test bundle deliberately cannot.
enum AppleNonceHash {

    static func hex(of value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
