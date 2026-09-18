import WebKit
/// Forwards script messages without keeping the real handler alive.
///
/// `WKUserContentController` retains whatever is registered with it, and a view controller
/// that registers itself ends up in a cycle: controller → web view → configuration → content
/// controller → controller. Nothing is ever released, and the teardown meant to unregister
/// the handler never runs. Registering this proxy instead keeps the reference weak.
@MainActor
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {

    private weak var target: (any WKScriptMessageHandler)?

    init(target: any WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
