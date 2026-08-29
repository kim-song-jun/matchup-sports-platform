import UIKit
import WebKit

/// Hosts the `WKWebView` that is the entire Teameet experience on iOS.
///
/// This is the counterpart of `MainActivity`. The shell owns navigation policy, the safe
/// area contract, downloads and session restoration; every pixel of interface comes from
/// the deployed web app.
@MainActor
final class WebShellViewController: UIViewController {

    private let config: AppConfig
    private let model: WebShellModel
    private let sessionStore: WebShellSessionStore
    private let reachability = NetworkReachability()

    private var webView: WKWebView!
    private var downloads: DownloadHandler!
    private var publishedBottomInset: Int?

    init(config: AppConfig, model: WebShellModel, sessionStore: WebShellSessionStore) {
        self.config = config
        self.model = model
        self.sessionStore = sessionStore
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("WebShellViewController is created in code") }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        installWebView()
        downloads = DownloadHandler(origin: config.webOrigin, presenter: self)
        downloads.onMessage = { [weak self] message in self?.model.showNotice(message) }
        model.controller = self

        reachability.onPathRestored = { [weak self] in self?.retryAfterConnectivityReturned() }
        reachability.start()
        observeBackgrounding()

        restoreOrLoadInitialRoute()
    }

    /// The session is written on the way out, so a termination the app is never told about
    /// still leaves the user where they were. The web view owns the state, so it owns the
    /// moment it is saved.
    private func observeBackgrounding() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.persistSession() }
        }
    }

    private func installWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        // Media on a match or tournament page should not require a second tap to start.
        configuration.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // iOS has no hardware back button; the edge-swipe gesture is the whole back affordance.
        webView.allowsBackForwardNavigationGestures = true
        // The page paints its own background; matching it here avoids a white flash on a
        // dark-mode launch.
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground

        if #available(iOS 16.4, *) {
            // Alpha only, and production stays false whatever the build type — the same
            // guarantee Android pins through BuildConfig.WEBVIEW_DEBUGGING_ENABLED.
            webView.isInspectable = config.webViewInspectable
        }

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            // Deliberately the view's own bottom, not the safe area's. The web app paints
            // its bottom navigation edge to edge and consumes the inset itself through
            // --v1-shell-safe-bottom; constraining to the safe area here would leave that
            // surface floating above the home indicator instead.
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishSafeAreaInset()
    }

    // MARK: - Safe area contract

    /// Publishes the bottom inset to the page.
    ///
    /// Without this the v1 web app has no bottom inset at all on iOS: it declares no
    /// `viewport-fit=cover`, so `env(safe-area-inset-bottom)` is `0` inside `WKWebView` and
    /// `--v1-shell-safe-bottom` resolves to whatever the shell writes.
    private func publishSafeAreaInset(force: Bool = false) {
        let inset = Int(view.safeAreaInsets.bottom.rounded())
        guard force || inset != publishedBottomInset else { return }
        publishedBottomInset = inset
        webView.evaluateJavaScript(
            SafeAreaBridge.script(bottomInsetPoints: Double(inset)), completionHandler: nil)
    }

    // MARK: - Loading

    private func restoreOrLoadInitialRoute() {
        if let state = sessionStore.load() {
            // Assigning restored state can only be trusted for state this build wrote; the
            // store has already refused anything else, so a mismatch lands on /home rather
            // than handing WebKit bytes it may not understand.
            webView.interactionState = state
            return
        }
        load(route: DeepLinkRoute.safeRoute("/home"))
    }

    /// Opens a route inside the shell. Used for the initial load and, from S7, for a
    /// notification tap.
    func load(route: String) {
        guard let url = config.url(forRoute: DeepLinkRoute.safeRoute(route)) else { return }
        model.clearFailure()
        webView.load(URLRequest(url: url))
    }

    /// Retry driven by the button on the error screen.
    func reloadFromFailure() {
        model.clearFailure()
        if webView.url == nil {
            load(route: "/home")
        } else {
            webView.reload()
        }
    }

    /// Retry driven by the network coming back.
    ///
    /// Only connectivity failures qualify. A server returning 500 is still returning 500
    /// once Wi-Fi reconnects, and hammering it during an outage helps nobody.
    private func retryAfterConnectivityReturned() {
        guard let failure = model.failure, failure.isRetriableOnReconnect else { return }
        reloadFromFailure()
    }

    // MARK: - Session persistence

    func persistSession() {
        sessionStore.save(webView.interactionState as? Data)
    }

    private func present(failure reason: WebShellFailureReason) {
        model.reportFailure(reason)
    }
}

// MARK: - Navigation policy

extension WebShellViewController: WKNavigationDelegate {

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        let url = navigationAction.request.url

        // Same order as MainActivity.shouldOverrideUrlLoading: internal wins, sub-frames
        // off-origin are dropped silently, the Kakao authorization host is the one third
        // party allowed to stay in the shell, and everything else leaves.
        if AllowedNavigation.isInternal(url, origin: config.webOrigin) { return .allow }
        guard navigationAction.targetFrame?.isMainFrame ?? true else { return .cancel }
        if AllowedNavigation.isTrustedAuthProvider(url) { return .allow }
        openExternally(url)
        return .cancel
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse
    ) async -> WKNavigationResponsePolicy {
        if let http = navigationResponse.response as? HTTPURLResponse,
           WebShellFailurePolicy.shouldPresentFailure(
               forStatusCode: http.statusCode, isMainFrame: navigationResponse.isForMainFrame) {
            // WKWebView would otherwise render the 5xx body as a perfectly good page and
            // never call a failure delegate, leaving the user on a server error screen with
            // no way back.
            present(failure: .serverError(statusCode: http.statusCode))
            return .cancel
        }
        // A response the web view cannot display is a file the user asked for.
        return navigationResponse.canShowMIMEType ? .allow : .download
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard AllowedNavigation.isInternal(webView.url, origin: config.webOrigin) else { return }
        model.clearFailure()
        // Forced because a fresh document has none of the properties the previous one had,
        // even when the measured inset has not changed.
        publishSafeAreaInset(force: true)
        persistSession()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        handleNavigationFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error)
    }

    private func handleNavigationFailure(_ error: Error) {
        // A cancelled navigation is not a failure. Tapping a second link while the first
        // loads cancels the first, and every link handed to Safari cancels its own
        // navigation by design — surfacing either would flash an error during normal use.
        guard WebShellFailurePolicy.shouldPresentFailure(for: error) else { return }
        present(failure: .from(error: error as NSError))
    }

    func webView(
        _ webView: WKWebView,
        navigationAction: WKNavigationAction,
        didBecome download: WKDownload
    ) {
        downloads.attach(download)
    }

    func webView(
        _ webView: WKWebView,
        navigationResponse: WKNavigationResponse,
        didBecome download: WKDownload
    ) {
        downloads.attach(download)
    }

    private func openExternally(_ url: URL?) {
        guard let url, AllowedNavigation.isAllowedExternal(url) else { return }
        UIApplication.shared.open(url)
    }
}

// MARK: - Window handling

extension WebShellViewController: WKUIDelegate {

    /// `target="_blank"` and `window.open` ask for a second web view. The shell has only
    /// one, so an internal destination continues in place and an external one leaves —
    /// which is what Android's single-window WebView does implicitly. Returning nil without
    /// this would make such links silently do nothing.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let url = navigationAction.request.url
        if AllowedNavigation.isInternal(url, origin: config.webOrigin)
            || AllowedNavigation.isTrustedAuthProvider(url) {
            webView.load(navigationAction.request)
        } else {
            openExternally(url)
        }
        return nil
    }
}
