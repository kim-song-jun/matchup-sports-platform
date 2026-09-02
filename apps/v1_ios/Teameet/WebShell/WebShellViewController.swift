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
    private let promptStore = PushPromptStore()
    private var urlObservation: NSKeyValueObservation?
    private let reachability = NetworkReachability()

    private var webView: WKWebView!
    private var downloads: DownloadHandler!
    private var publishedBottomInset: Int?
    /// Supplied by the app delegate, which owns the APNs callbacks. Absent only in a build
    /// with no push at all, where the bridge honestly reports "not subscribed".
    private let push: PushCoordinator?

    init(
        config: AppConfig,
        model: WebShellModel,
        sessionStore: WebShellSessionStore,
        push: PushCoordinator?
    ) {
        self.config = config
        self.model = model
        self.sessionStore = sessionStore
        self.push = push
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
        observeInPageNavigation()

        restoreOrLoadInitialRoute()
    }

    /// The session is written on the way out, so a termination the app is never told about
    /// still leaves the user where they were. The web view owns the state, so it owns the
    /// moment it is saved.
    /// Re-runs the post-load work when the page changes without loading a document.
    ///
    /// `didFinish` fires for document loads only, and the web app is a single-page app: a
    /// reader who signs in gets a client-side transition, so no document loads and nothing
    /// re-runs. That is invisible until something depends on state that only exists *after*
    /// sign-in — the session cookie. Measured: on a clean install the notification explainer
    /// never appeared, because the one place that asks about it had already run, once, on
    /// the signed-out landing page.
    ///
    /// `url` is the signal because `pushState` updates it. Registration is re-run here too
    /// for the same reason: it needs the session cookie, which appears at exactly this moment.
    private func observeInPageNavigation() {
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] _, _ in
            guard let self else { return }
            MainActor.assumeIsolated {
                guard AllowedNavigation.isInternal(self.webView.url, origin: self.config.webOrigin)
                else { return }
                Task {
                    await self.push?.register()
                    await self.considerAskingAboutNotifications()
                }
            }
        }
    }

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

        // Installed before any page script runs, because the web calls
        // isNativePushAvailable() during render.
        configuration.userContentController.addUserScript(WKUserScript(
            source: NativeBridge.shimScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true))
        // Pins the page at 1:1. Without it a 15px text field taking focus zooms the whole
        // page in, and pinch and double-tap zoom are live. Document end, because the tag it
        // rewrites is server-rendered into <head> and has to exist first; the script keeps
        // watching for React rendering it again. See ViewportLock.
        configuration.userContentController.addUserScript(WKUserScript(
            source: ViewportLock.script,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true))
        // Registered through a weak proxy. WKUserContentController retains its handlers, and
        // this controller owns the web view that owns the configuration that owns the
        // controller — registering `self` directly would keep the whole graph alive forever
        // and mean the teardown that unregisters it never runs.
        configuration.userContentController.add(
            WeakScriptMessageHandler(target: self), name: NativeBridge.handlerName)

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

        // The status bar band belongs to the shell, not to the page, and it has to be the
        // page's colour rather than the system's. The two disagree whenever the reader's
        // theme choice in the web app differs from the device's — a dark phone showing the
        // light site got a black bar above a white header. WebKit already derives the page's
        // colour for its own over-scroll fill, so that is what gets mirrored here instead of
        // asking the page and parsing a string back.

        // The shell owns the bottom inset and hands it to the page as a CSS variable, so
        // UIKit must not also reserve it. Left at its default `.automatic`, the scroll view
        // shortens the page by the home-indicator inset *and* the page adds the same value
        // through --v1-shell-safe-bottom — the bottom navigation then floats a full inset
        // too high. Measured against the deployed web app at the same viewport: browser
        // 56pt of clearance, shell 90pt, a difference of exactly one 34pt inset.
        webView.scrollView.contentInsetAdjustmentBehavior = .never

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

    // MARK: - Chrome colour

    /// Paints the shell's own surfaces with the page's background colour.
    ///
    /// The band above the page belongs to the shell — the web view starts below the status
    /// bar — and it has to be the page's colour, not the device's. The two disagree whenever
    /// the reader's theme in the web app differs from the system's: a phone in dark mode
    /// showing the light site got a black bar above a white header.
    ///
    /// The colour is read from the page rather than from `underPageBackgroundColor`, which
    /// reports the system's answer here, not the document's (measured: still black on a
    /// white page in dark appearance).
    private func adoptPageBackgroundColour() {
        webView.evaluateJavaScript(ChromeColour.probeScript) { [weak self] value, _ in
            guard let self, let colour = ChromeColour.parse(value as? String) else { return }
            self.view.backgroundColor = colour
            self.webView.backgroundColor = colour
            self.webView.scrollView.backgroundColor = colour
        }
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
        adoptPageBackgroundColour()
        persistSession()
        // Mirrors Android's onPageFinished: a registration needs the session cookie, and
        // this is the first moment it is guaranteed to exist.
        Task {
            await push?.register()
            await considerAskingAboutNotifications()
        }
    }

    /// Offers the shell's own notification explainer, once the reader is in a position for it
    /// to mean something.
    ///
    /// Hung off `didFinish` because that is the only moment the shell knows both things the
    /// decision needs: a page of ours has loaded, and the cookie jar for our origin is
    /// populated. Without this the sole path to the system dialog is 마이 → 알림 설정, which
    /// a reader has to go looking for — and iOS asks once, so not looking means never asked.
    private func considerAskingAboutNotifications() async {
        guard let push, !model.isAskingAboutNotifications else { return }
        let permission = await push.permissionStatus()
        let signedIn = await hasSessionCookie()
        guard PushPromptPolicy.shouldPrompt(
            permission: permission, signedIn: signedIn, state: promptStore.state, now: Date())
        else { return }
        model.askAboutNotifications()
    }

    /// Whether the web view holds the API's session cookie for our origin.
    ///
    /// Specifically the session cookie, not any cookie: the origin sets cookies for a
    /// signed-out visitor too, and treating those as a session put the explainer in front of
    /// a reader who had not signed in — the one case it must not appear in.
    private func hasSessionCookie() async -> Bool {
        guard let host = AllowedNavigation.parse(config.webOrigin)?.host else { return false }
        let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
        return PushCookieScope.hasSession(
            cookies: cookies.map { (name: $0.name, domain: $0.domain) }, host: host)
    }

    /// Called by the explainer's buttons.
    func acceptNotificationPrompt() {
        promptStore.recordAccepted()
        model.stopAskingAboutNotifications()
        // The real dialog, spent deliberately now that the reader has said yes to the idea.
        Task { _ = await push?.requestPermission() }
    }

    func deferNotificationPrompt() {
        promptStore.recordDeferral()
        model.stopAskingAboutNotifications()
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
        // A cancelled navigation is usually not a failure: every link handed to Safari,
        // every intercepted 5xx and every response turned into a download cancels itself by
        // design, and surfacing those would flash an error during normal use.
        //
        // The exception is a cancellation that leaves nothing on screen — a cold start whose
        // first load redirects off-origin, or a main document served as a file. Swallowing
        // those strands the user on a blank window, which is the state this shell exists to
        // prevent.
        guard WebShellFailurePolicy.shouldPresentFailure(
            for: error,
            hasVisibleContent: webView.url != nil,
            isAlreadyPresentingFailure: model.failure != nil
        ) else { return }
        present(failure: .forFailure(error as NSError))
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

// MARK: - Native push bridge

extension WebShellViewController: WKScriptMessageHandler {

    /// Receives `window.TeameetNative.postMessage(...)` from the page.
    ///
    /// Two checks stand between the page and the shell, and they are the iOS equivalent of
    /// the `allowedOriginRules` argument Android passes to `addWebMessageListener`: WebKit
    /// enforces the origin there, so it has to be enforced here.
    ///
    /// Anything that fails is dropped in silence. Replying to an untrusted frame would tell
    /// it the reader's notification state, and replying to a malformed request would resolve
    /// a promise nobody made.
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.frameInfo.isMainFrame,
              matchesConfiguredOrigin(message.frameInfo.securityOrigin),
              let request = NativeBridge.parse(message.body) else { return }
        Task { await handle(request) }
    }

    /// Hands WebKit's already-parsed origin to the rule in `NativeBridge`.
    private func matchesConfiguredOrigin(_ origin: WKSecurityOrigin) -> Bool {
        NativeBridge.matchesOrigin(
            scheme: origin.protocol,
            host: origin.host,
            port: origin.port,
            expectedOrigin: config.webOrigin)
    }

    private func handle(_ request: NativeBridge.Message) async {
        guard let push else {
            // No push lifecycle in this build. Answering honestly beats leaving the page's
            // promise to time out: the settings screen renders an off switch instead of
            // spinning.
            await reply(to: request, permission: .denied, subscribed: false)
            return
        }

        switch request.action {
        case .getPushState:
            break
        case .requestNotificationPermission:
            _ = await push.requestPermission()
        case .openNotificationSettings:
            openNotificationSettings()
        case .revokePushDevice:
            await push.revoke()
        }

        // Every action answers with freshly read state rather than what it just did. The
        // difference matters for `open-notification-settings`, where the reader may change
        // the permission outside the app entirely.
        await reply(
            to: request,
            permission: await push.currentPermission(),
            subscribed: await push.isSubscribed())
    }

    /// Opens this app's page in Settings. Counterpart of Android's
    /// `ACTION_APP_NOTIFICATION_SETTINGS` branch, which the web relies on to give a denied
    /// reader a way back.
    private func openNotificationSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString),
              UIApplication.shared.canOpenURL(url) else { return }
        UIApplication.shared.open(url)
    }

    private func reply(
        to request: NativeBridge.Message,
        permission: PushPermission.WebValue,
        subscribed: Bool
    ) async {
        let script = NativeBridge.resultScript(
            requestId: request.requestId,
            permission: permission.rawValue,
            subscribed: subscribed)
        guard !script.isEmpty else { return }
        _ = try? await webView.evaluateJavaScript(script)
    }
}
