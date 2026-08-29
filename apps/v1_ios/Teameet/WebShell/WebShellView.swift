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

    func makeUIViewController(context: Context) -> WebShellViewController {
        WebShellViewController(config: config, model: model, sessionStore: sessionStore)
    }

    func updateUIViewController(_ controller: WebShellViewController, context: Context) {}
}
