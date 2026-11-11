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
        /// The reader backed out of KakaoTalk or the account page, or the attempt was
        /// replaced. Not something to report.
        case cancelled
        /// A `KakaoSignInFailure.report` for the page to log.
        case failed(String)
    }

    // The SDK's mutable OAuthToken is not Sendable. Copy only the immutable values
    // needed by this flow before resuming across the callback/actor boundary.
    private struct Credentials: Sendable {
        let accessToken: String
        let scopes: [String]
    }

    /// A step that failed; `authenticate()` decides whether it ends the sign-in.
    private struct StepFailure: Error {
        let failure: KakaoSignInFailure
    }

    private let latest = KakaoSignInLatest<String>()

    /// Only call when `AppConfig.isKakaoSignInConfigured`; the SDK throws on a missing key.
    func signIn(scopes: [String] = []) async throws -> String {
        // The SDK holds one KakaoTalk callback, so a second request would strand the first.
        // The first is cancelled instead; its steps ignore a late SDK callback.
        try await latest.run { try await self.authorize(scopes: scopes) }
    }

    private func authorize(scopes: [String]) async throws -> String {
        let token = try await authenticate()
        let missing = KakaoSignInPolicy.additionalScopes(requested: scopes, granted: token.scopes)
        guard !missing.isEmpty else { return token.accessToken }
        // One additional-consent request. A successful response may omit optional items
        // the reader declined; it still completes sign-in without prompting again.
        return try await requestConsent(scopes: missing).accessToken
    }

    private func authenticate() async throws -> Credentials {
        var talkFailure: KakaoSignInFailure?
        if UserApi.isKakaoTalkLoginAvailable() {
            do {
                return try await loginWithKakaoTalk()
            } catch let step as StepFailure {
                // Talk installed but unusable (not logged in, handoff refused): the account
                // login is the documented fallback. A cancelled Talk login is a decision, so
                // it propagates instead.
                talkFailure = step.failure
            }
        }
        do {
            return try await loginWithKakaoAccount()
        } catch let step as StepFailure {
            throw Failure.failed(KakaoSignInFailure.report([talkFailure, step.failure].compactMap { $0 }))
        }
    }

    private func loginWithKakaoTalk() async throws -> Credentials {
        let step = KakaoSignInStep<Credentials>()
        let handoff = TalkHandoffObservation { step.deliver(.failure(Failure.cancelled)) }
        defer { handoff.stop() }
        return try await run(step) {
            // Custom scheme rather than the default universal link, which would need an
            // association file for the Kakao domain.
            UserApi.shared.loginWithKakaoTalk(launchMethod: .CustomScheme) { token, error in
                step.deliver(Self.result(token: token, error: error, step: .talk))
            }
        }
    }

    private func loginWithKakaoAccount() async throws -> Credentials {
        let step = KakaoSignInStep<Credentials>()
        return try await run(step) {
            UserApi.shared.loginWithKakaoAccount { token, error in
                step.deliver(Self.result(token: token, error: error, step: .account))
            }
        }
    }

    private func requestConsent(scopes: [String]) async throws -> Credentials {
        let step = KakaoSignInStep<Credentials>()
        do {
            return try await run(step) {
                UserApi.shared.loginWithKakaoAccount(scopes: scopes) { token, error in
                    step.deliver(Self.result(token: token, error: error, step: .consent))
                }
            }
        } catch let failed as StepFailure {
            throw Failure.failed(KakaoSignInFailure.report([failed.failure]))
        }
    }

    /// Starts an SDK step and waits for the SDK callback or a cancellation, whichever settles it.
    private func run(_ step: KakaoSignInStep<Credentials>, start: () -> Void) async throws -> Credentials {
        try await withTaskCancellationHandler {
            // A cancelled attempt must not open KakaoTalk or the account page at all.
            if Task.isCancelled { throw Failure.cancelled }
            start()
            return try await step.wait()
        } onCancel: {
            step.deliver(.failure(Failure.cancelled))
        }
    }

    private nonisolated static func result(
        token: OAuthToken?, error: Error?, step: KakaoSignInFailure.Step
    ) -> Result<Credentials, Error> {
        if let error {
            if let sdkError = error as? SdkError, sdkError.isClientFailed,
               sdkError.getClientError().reason == .Cancelled {
                return .failure(Failure.cancelled)
            }
            return .failure(StepFailure(failure: summary(of: error, step: step)))
        }
        guard let token, !token.accessToken.isEmpty else {
            let missing = KakaoSignInFailure(step: step, family: "Other", reason: "MissingAccessToken")
            return .failure(StepFailure(failure: missing))
        }
        return .success(Credentials(accessToken: token.accessToken, scopes: token.scopes ?? []))
    }

    private nonisolated static func summary(of error: Error, step: KakaoSignInFailure.Step) -> KakaoSignInFailure {
        guard let sdkError = error as? SdkError else {
            let bridged = error as NSError
            return KakaoSignInFailure(
                step: step, family: "Other", reason: String(describing: type(of: error)),
                detail: "\(bridged.domain) \(bridged.code)")
        }
        switch sdkError {
        case let .ClientFailed(reason, message):
            return KakaoSignInFailure(
                step: step, family: "ClientFailed", reason: String(describing: reason), detail: message)
        case let .ApiFailed(reason, info):
            return KakaoSignInFailure(
                step: step, family: "ApiFailed", reason: String(describing: reason),
                detail: info.map { "\($0.code.rawValue) \($0.msg)" })
        case let .AuthFailed(reason, info):
            return KakaoSignInFailure(
                step: step, family: "AuthFailed", reason: String(describing: reason),
                detail: info?.errorDescription)
        case let .AppsFailed(reason, info):
            return KakaoSignInFailure(
                step: step, family: "AppsFailed", reason: String(describing: reason), detail: info?.errorMsg)
        }
    }

    /// Whether a URL is the KakaoTalk handoff coming back, and if so lets the SDK finish it.
    static func handle(openURL url: URL) -> Bool {
        guard AuthApi.isKakaoTalkLoginUrl(url) else { return false }
        // Announced before the SDK's delayed token exchange: the handoff watch needs to know
        // KakaoTalk came back, not that the exchange finished.
        NotificationCenter.default.post(name: .kakaoTalkRedirectReceived, object: nil)
        return AuthController.handleOpenUrl(url: url)
    }
}

extension Notification.Name {
    fileprivate static let kakaoTalkRedirectReceived = Notification.Name("teameet.kakaoTalkRedirectReceived")
}

/// Feeds the app lifecycle and the KakaoTalk redirect to a `KakaoSignInHandoffWatch` for the
/// length of one KakaoTalk handoff.
@MainActor
private final class TalkHandoffObservation {

    private let watch: KakaoSignInHandoffWatch
    private var observers: [NSObjectProtocol] = []

    init(onAbandoned: @escaping @MainActor () -> Void) {
        watch = KakaoSignInHandoffWatch(onAbandoned: onAbandoned)
        observe(UIApplication.didEnterBackgroundNotification) { $0.appDidEnterBackground() }
        observe(UIApplication.didBecomeActiveNotification) { $0.appDidBecomeActive() }
        observe(.kakaoTalkRedirectReceived) { $0.redirectReceived() }
    }

    func stop() {
        watch.stop()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
    }

    private func observe(
        _ name: Notification.Name, _ event: @escaping @MainActor @Sendable (KakaoSignInHandoffWatch) -> Void
    ) {
        let watch = watch
        observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { event(watch) }
        })
    }
}
