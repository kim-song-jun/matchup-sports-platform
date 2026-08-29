import SwiftUI

/// Entry point for the Teameet iOS shell.
///
/// The shell deliberately owns almost no interface. Every screen a user sees is served by
/// the deployed v1 web app, which the shell loads from the origin its build configuration
/// names; nothing is bundled. That is the same arrangement as `apps/v1_android`, and it is
/// what lets a web release reach both apps without a store submission.
///
/// The window paints an opaque background of its own so that the area behind the safe
/// insets matches the page instead of flashing white before the first paint.
@main
struct TeameetApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    var body: some View {
        Color(.systemBackground)
            .ignoresSafeArea()
    }
}
