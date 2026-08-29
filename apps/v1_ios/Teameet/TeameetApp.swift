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

    @StateObject private var model = WebShellModel()

    private let config = AppConfig.main
    private let sessionStore = WebShellSessionStore(
        defaults: .standard,
        appBuild: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0",
        osMajorVersion: ProcessInfo.processInfo.operatingSystemVersion.majorVersion)

    var body: some Scene {
        WindowGroup {
            RootView(config: config, model: model, sessionStore: sessionStore)
        }
    }
}

struct RootView: View {

    let config: AppConfig
    @ObservedObject var model: WebShellModel
    let sessionStore: WebShellSessionStore

    var body: some View {
        WebShellView(config: config, model: model, sessionStore: sessionStore)
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
    }
}

/// Transient message about a download, matching the two `Toast` messages `MainActivity`
/// shows. It is dismissed by tapping, so it never traps the screen.
private struct NoticeBanner: View {

    let message: String
    let onDismiss: () -> Void

    var body: some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(Color(.systemBackground))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .background(Color(.label), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .onTapGesture(perform: onDismiss)
            .accessibilityAddTraits(.isStaticText)
            .accessibilityHint("탭하면 닫아요")
    }
}
