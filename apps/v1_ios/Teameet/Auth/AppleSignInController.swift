import AuthenticationServices
import UIKit

/// Puts up Apple's sign-in sheet and hands back what it produced.
///
/// The web app cannot do this itself: Apple blocks its own web flow inside an embedded
/// browser, so a `WKWebView` shell has to present `ASAuthorizationController` natively and
/// pass the identity token back over the bridge. That is the whole reason this type exists.
///
/// Two details are easy to get wrong and both are load-bearing:
///
/// - **The nonce is hashed here, not on the server.** Apple echoes back whatever string the
///   request carried, so the request must carry `SHA256(raw)` and the server compares
///   against the same hash. Sending the raw value would have the server comparing a hash to
///   a plaintext and refusing every sign-in.
/// - **The full name arrives once.** Apple sends it on the very first authorization for this
///   app and never again — not after a reinstall, not after signing out. If it is not
///   forwarded on that one occasion it is gone for good.
@MainActor
final class AppleSignInController: NSObject {

    struct Credential {
        let identityToken: String
        /// Nil on every authorization after the first. See the note above.
        let fullName: String?
    }

    enum Failure: Error {
        /// The reader dismissed the sheet. Not something to report to them.
        case cancelled
        /// Apple answered, but without the token the server needs.
        case missingIdentityToken
        case failed(String)
    }

    private var continuation: CheckedContinuation<Credential, Error>?
    /// Held for the lifetime of the request: `ASAuthorizationController` does not retain its
    /// delegate, and a controller that is released mid-sheet simply never answers.
    private var controller: ASAuthorizationController?
    private weak var presentationAnchor: UIWindow?

    /// - Parameter rawNonce: the value the **server** issued, unhashed.
    func signIn(rawNonce: String, anchor: UIWindow?) async throws -> Credential {
        // A second sheet while one is up would strand the first continuation forever.
        if continuation != nil { throw Failure.failed("Apple sign-in is already in progress") }

        presentationAnchor = anchor
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = AppleNonceHash.hex(of: rawNonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<Credential, Error>) {
        let pending = continuation
        continuation = nil
        controller = nil
        pending?.resume(with: result)
    }
}

// MARK: - Apple's callbacks

extension AppleSignInController: ASAuthorizationControllerDelegate {

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        // Read the payload out here: `ASAuthorization` is not Sendable, so only the strings
        // may cross into the actor.
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential
        let token = credential?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        let name = credential?.fullName.flatMap { components -> String? in
            let formatter = PersonNameComponentsFormatter()
            let formatted = formatter.string(from: components)
            return formatted.isEmpty ? nil : formatted
        }

        Task { @MainActor in
            guard let token, !token.isEmpty else {
                self.finish(.failure(Failure.missingIdentityToken))
                return
            }
            self.finish(.success(Credential(identityToken: token, fullName: name)))
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        let description = error.localizedDescription

        Task { @MainActor in
            self.finish(.failure(cancelled ? Failure.cancelled : Failure.failed(description)))
        }
    }
}

extension AppleSignInController: ASAuthorizationControllerPresentationContextProviding {

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            // The shell has exactly one window; `ASPresentationAnchor` is non-optional, so a
            // missing one is answered with a fresh window rather than a crash.
            presentationAnchor ?? UIWindow()
        }
    }
}
