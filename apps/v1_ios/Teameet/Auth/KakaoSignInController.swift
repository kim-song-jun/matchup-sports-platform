import KakaoSDKAuth
import KakaoSDKCommon
import KakaoSDKUser
import UIKit

/// Signs in through Kakao's native SDK and hands back the access token.
///
/// Native because the SDK switches to the KakaoTalk app and back, which a `WKWebView` cannot
/// do. The server verifies the token (`POST /auth/kakao/token`); nothing here judges it.
@MainActor
final class KakaoSignInController {

    enum Failure: Error {
        /// The reader backed out of KakaoTalk or the account page. Not something to report.
        case cancelled
        case missingAccessToken
        case failed(String)
    }

    private var inFlight = false

    /// Only call when `AppConfig.isKakaoSignInConfigured`; the SDK throws on a missing key.
    func signIn(scopes: [String] = []) async throws -> String {
        // A second login while one is up would strand the first callback.
        if inFlight { throw Failure.failed("Kakao sign-in is already in progress") }
        inFlight = true
        defer { inFlight = false }

        let token = try await authenticate()
        let missing = KakaoSignInPolicy.additionalScopes(requested: scopes, granted: token.scopes ?? [])
        guard !missing.isEmpty else { return token.accessToken }
        // One additional-consent request. A successful response may omit optional items
        // the reader declined; it still completes sign-in without prompting again.
        let consented = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<OAuthToken, Error>) in
            UserApi.shared.loginWithKakaoAccount(scopes: missing) { token, error in
                continuation.resume(with: Self.result(token: token, error: error))
            }
        }
        return consented.accessToken
    }

    private func authenticate() async throws -> OAuthToken {
        if UserApi.isKakaoTalkLoginAvailable() {
            do {
                return try await loginWithKakaoTalk()
            } catch Failure.cancelled {
                // A cancelled Talk login is a decision, so it does not fall through to the
                // account page.
                throw Failure.cancelled
            } catch {
                // Talk installed but unusable (not logged in, handoff refused): the account
                // login is the documented fallback.
            }
        }
        return try await loginWithKakaoAccount()
    }

    private func loginWithKakaoTalk() async throws -> OAuthToken {
        try await withCheckedThrowingContinuation { continuation in
            // Custom scheme rather than the default universal link, which would need an
            // association file for the Kakao domain.
            UserApi.shared.loginWithKakaoTalk(launchMethod: .CustomScheme) { token, error in
                continuation.resume(with: Self.result(token: token, error: error))
            }
        }
    }

    private func loginWithKakaoAccount() async throws -> OAuthToken {
        try await withCheckedThrowingContinuation { continuation in
            UserApi.shared.loginWithKakaoAccount { token, error in
                continuation.resume(with: Self.result(token: token, error: error))
            }
        }
    }

    private nonisolated static func result(token: OAuthToken?, error: Error?) -> Result<OAuthToken, Error> {
        if let error {
            if let sdkError = error as? SdkError, sdkError.isClientFailed,
               sdkError.getClientError().reason == .Cancelled {
                return .failure(Failure.cancelled)
            }
            return .failure(Failure.failed(error.localizedDescription))
        }
        guard let token, !token.accessToken.isEmpty else { return .failure(Failure.missingAccessToken) }
        return .success(token)
    }

    /// Whether a URL is the KakaoTalk handoff coming back, and if so lets the SDK finish it.
    static func handle(openURL url: URL) -> Bool {
        guard AuthApi.isKakaoTalkLoginUrl(url) else { return false }
        return AuthController.handleOpenUrl(url: url)
    }
}
