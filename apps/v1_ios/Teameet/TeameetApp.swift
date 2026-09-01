import SwiftUI
import UIKit

/// Entry point for the Teameet iOS shell.
///
/// The shell owns almost no interface. Every screen a user sees is served by the deployed
/// v1 web app, which `WebShellView` loads from the origin its build configuration names;
/// nothing is bundled. That is the same arrangement as `apps/v1_android`, and it is what
/// lets a web release reach both apps without a store submission.
@main
struct TeameetApp: App {

    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = WebShellModel()

    private let config = AppConfig.main
    private let sessionStore = WebShellSessionStore(
        defaults: .standard,
        appBuild: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0",
        osMajorVersion: ProcessInfo.processInfo.operatingSystemVersion.majorVersion)

    var body: some Scene {
        WindowGroup {
            RootView(
                config: config, model: model, sessionStore: sessionStore, appDelegate: appDelegate)
        }
    }
}

struct RootView: View {

    let config: AppConfig
    @ObservedObject var model: WebShellModel
    let sessionStore: WebShellSessionStore
    let appDelegate: AppDelegate

    var body: some View {
        WebShellView(
            config: config, model: model, sessionStore: sessionStore, appDelegate: appDelegate)
            // The controller measures the safe area itself and publishes the bottom inset
            // to the page, so the scene hands it the whole screen.
            .ignoresSafeArea()
            .overlay {
                if let failure = model.failure {
                    LoadFailureView(reason: failure) { model.retry() }
                }
            }
            .overlay(alignment: .bottom) {
                if let notice = model.notice {
                    NoticeBanner(message: notice) { model.dismissNotice() }
                }
            }
            // Above the page rather than inside it: the shell is asking, not the web app, and
            // a reader must be able to tell which. It is also the only overlay that blocks —
            // an explainer you can scroll past is an explainer nobody answers.
            .overlay {
                if model.isAskingAboutNotifications {
                    PushPromptView(
                        onAccept: { appDelegate.shell?.acceptNotificationPrompt() },
                        onDefer: { appDelegate.shell?.deferNotificationPrompt() })
                        .transition(.opacity)
                }
            }
            // A universal link. This is what brings the Kakao sign-in redirect back into the
            // app: `AllowedNavigation` sends the authorization pages out to Safari, so
            // without this the redirect to /callback/kakao completes there and the session
            // is created in the wrong browser.
            //
            // A link for another host produces no route and is ignored here, which leaves
            // the system to open it in Safari — the right outcome for a page this shell has
            // no business rendering with the reader's session attached.
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                guard let url = activity.webpageURL,
                      let route = UniversalLink.route(for: url, origin: config.webOrigin)
                else { return }
                appDelegate.open(route: route)
            }
    }
}

/// Transient message about a download, matching the two `Toast` messages `MainActivity`
/// shows. It is dismissed by tapping, so it never traps the screen.
private struct NoticeBanner: View {

    let message: String
    let onDismiss: () -> Void

    var body: some View {
        // A button, not text with a tap gesture. The only way to dismiss this is to tap it,
        // and a `.isStaticText` trait told VoiceOver the opposite — that there was nothing
        // here to activate, leaving the notice on screen with no way to clear it.
        Button(action: onDismiss) {
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color(.systemBackground))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(minHeight: 44)
                .background(Color(.label), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
        .accessibilityLabel("\(message), 알림 닫기")
        .accessibilityHint("탭하면 닫아요")
    }
}
