import SwiftUI

/// SwiftUI wrapper around `WebShellViewController`.
///
/// Intentionally thin: the controller owns the web view, its delegates and the safe-area
/// contract, so this type only bridges it into the scene and keeps a reference for the
/// error screen's retry button.
struct WebShellView: UIViewControllerRepresentable {

    let config: AppConfig
    let model: WebShellModel
    let sessionStore: WebShellSessionStore
    let appDelegate: AppDelegate

    func makeUIViewController(context: Context) -> WebShellViewController {
        let controller = WebShellViewController(
            config: config,
            model: model,
            sessionStore: sessionStore,
            push: appDelegate.push)
        // Gives a notification tap somewhere to navigate, and replays one that arrived
        // during a cold launch before this controller existed.
        appDelegate.attach(shell: controller)
        return controller
    }

    func updateUIViewController(_ controller: WebShellViewController, context: Context) {}
}
