import XCTest

/// Pins the two rules that decide whether the user sees the shell's error screen.
///
/// Both exist because the obvious implementation is wrong in a way that only shows up in
/// use: a naive `didFail` handler flashes an error during ordinary navigation, and a shell
/// with no status-code check leaves the user staring at a server's 500 body.
final class WebShellFailurePolicyTests: XCTestCase {

    private func urlError(_ code: Int) -> NSError {
        NSError(domain: NSURLErrorDomain, code: code)
    }

    // MARK: - Cancellations are not failures

    private func present(
        _ error: NSError, hasVisibleContent: Bool = true, alreadyPresenting: Bool = false
    ) -> Bool {
        WebShellFailurePolicy.shouldPresentFailure(
            for: error,
            hasVisibleContent: hasVisibleContent,
            isAlreadyPresentingFailure: alreadyPresenting)
    }

    /// Every link the shell hands to Safari, every intercepted 5xx and every response turned
    /// into a download cancels itself by design. While a page is still on screen, surfacing
    /// those would flash an error during completely normal use.
    func testDoesNotPresentFailureForCancellationsWhileAPageIsVisible() {
        XCTAssertFalse(present(urlError(WebShellFailurePolicy.urlErrorCancelled)))
        XCTAssertFalse(present(urlError(NSURLErrorCancelled)))
        XCTAssertFalse(present(NSError(
            domain: WebShellFailurePolicy.webKitErrorDomain,
            code: WebShellFailurePolicy.webKitErrorFrameLoadInterruptedByPolicyChange)))
    }

    /// The case that made the shell go blank.
    ///
    /// A cold start whose first load redirects off-origin is cancelled and handed to Safari;
    /// a main document served as a file becomes a download. Both answer with a 102 while the
    /// web view holds no page at all. Suppressing that leaves a flat white window with no
    /// retry — measured on the simulator as a single distinct colour below the status bar.
    func testPresentsFailureWhenACancellationLeavesNothingOnScreen() {
        XCTAssertTrue(present(
            NSError(domain: WebShellFailurePolicy.webKitErrorDomain,
                    code: WebShellFailurePolicy.webKitErrorFrameLoadInterruptedByPolicyChange),
            hasVisibleContent: false))
        XCTAssertTrue(present(urlError(NSURLErrorCancelled), hasVisibleContent: false))
    }

    /// The 5xx path sets its own reason and is then followed by a 102 from the cancel it
    /// asked for. Without this the follow-up would replace an accurate "server error 503"
    /// with a generic message.
    func testDoesNotOverwriteAFailureThatIsAlreadyShowing() {
        XCTAssertFalse(present(
            NSError(domain: WebShellFailurePolicy.webKitErrorDomain,
                    code: WebShellFailurePolicy.webKitErrorFrameLoadInterruptedByPolicyChange),
            hasVisibleContent: false,
            alreadyPresenting: true))
    }

    /// A cancellation that leaves nothing behind is not a network problem, and the copy must
    /// not send the reader off to check Wi-Fi.
    func testMapsAnEmptyCancellationToTheInterruptedReason() {
        let cancelled = NSError(
            domain: WebShellFailurePolicy.webKitErrorDomain,
            code: WebShellFailurePolicy.webKitErrorFrameLoadInterruptedByPolicyChange)
        XCTAssertEqual(WebShellFailureReason.forFailure(cancelled), .interrupted)
        XCTAssertEqual(
            WebShellFailureReason.forFailure(urlError(NSURLErrorCannotFindHost)), .unreachable)
        XCTAssertEqual(
            WebShellFailureReason.forFailure(urlError(NSURLErrorNotConnectedToInternet)), .offline)
        XCTAssertFalse(WebShellFailureReason.interrupted.isRetriableOnReconnect)
    }

    func testPresentsFailureForRealNavigationErrors() {
        for code in [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorTimedOut,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorSecureConnectionFailed,
        ] {
            XCTAssertTrue(
                present(urlError(code)),
                "URL error \(code) should surface the error screen even with a page visible")
        }
    }

    /// -999 in another domain is a different error entirely; only `NSURLErrorDomain` and the
    /// WebKit policy code are cancellations.
    func testOnlyTreatsCancellationsFromTheirOwnDomainsAsCancellations() {
        XCTAssertTrue(present(NSError(domain: "kr.co.teameet.Something", code: -999)))
        XCTAssertTrue(present(NSError(
            domain: WebShellFailurePolicy.webKitErrorDomain, code: 101)))
        XCTAssertFalse(WebShellFailurePolicy.isCancellation(
            NSError(domain: "kr.co.teameet.Something", code: -999)))
        XCTAssertTrue(WebShellFailurePolicy.isCancellation(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)))
    }

    // MARK: - Status codes

    /// `WKWebView` treats a 500 as a page that loaded, so nothing else in the delegate chain
    /// will notice it.
    func testPresentsFailureForServerErrors() {
        for code in [500, 502, 503, 504, 599] {
            XCTAssertTrue(
                WebShellFailurePolicy.shouldPresentFailure(forStatusCode: code, isMainFrame: true),
                "\(code) should surface the error screen")
        }
    }

    /// The v1 web app serves real pages for client errors — a Next.js not-found is a 404
    /// with a designed screen behind it. Intercepting 4xx would replace working product
    /// screens with a shell error.
    func testLetsTheWebAppOwnClientErrors() {
        for code in [200, 201, 302, 400, 401, 403, 404, 409, 422, 429, 499] {
            XCTAssertFalse(
                WebShellFailurePolicy.shouldPresentFailure(forStatusCode: code, isMainFrame: true),
                "\(code) belongs to the web app")
        }
    }

    /// A failing iframe must not take down a page the reader can otherwise use.
    func testIgnoresSubframeResponses() {
        XCTAssertFalse(
            WebShellFailurePolicy.shouldPresentFailure(forStatusCode: 500, isMainFrame: false))
    }

    // MARK: - Connectivity classification

    /// Only a connectivity failure is worth retrying when the network comes back. A server
    /// returning 500 is still returning 500 after Wi-Fi reconnects, so retrying it on every
    /// path change would just add load during an outage.
    func testRecognisesConnectivityFailures() {
        for code in [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorTimedOut,
        ] {
            XCTAssertTrue(
                WebShellFailurePolicy.isConnectivityFailure(urlError(code)),
                "URL error \(code) is a connectivity failure")
        }
        XCTAssertFalse(WebShellFailurePolicy.isConnectivityFailure(
            urlError(NSURLErrorBadServerResponse)))
        XCTAssertFalse(WebShellFailurePolicy.isConnectivityFailure(
            NSError(domain: WebShellFailurePolicy.webKitErrorDomain, code: 102)))
        XCTAssertFalse(WebShellFailurePolicy.isConnectivityFailure(
            urlError(NSURLErrorCancelled)))
    }

    // MARK: - Reason mapping

    func testDistinguishesOfflineFromUnreachable() {
        XCTAssertEqual(
            WebShellFailureReason.from(error: urlError(NSURLErrorNotConnectedToInternet)), .offline)
        XCTAssertEqual(
            WebShellFailureReason.from(error: urlError(NSURLErrorDataNotAllowed)), .offline)
        XCTAssertEqual(
            WebShellFailureReason.from(error: urlError(NSURLErrorCannotFindHost)), .unreachable)
        XCTAssertEqual(
            WebShellFailureReason.from(error: urlError(NSURLErrorTimedOut)), .unreachable)
    }
}

/// Pins the edge-detection that keeps automatic retry from becoming a retry loop.
final class NetworkPathTransitionTests: XCTestCase {

    func testOnlyTheEdgeIntoASatisfiedPathCounts() {
        XCTAssertTrue(NetworkPathTransition.isRestoration(wasSatisfied: false, isSatisfied: true))
        XCTAssertFalse(
            NetworkPathTransition.isRestoration(wasSatisfied: true, isSatisfied: true),
            "an update that leaves the path satisfied must not trigger another reload")
        XCTAssertFalse(NetworkPathTransition.isRestoration(wasSatisfied: true, isSatisfied: false))
        XCTAssertFalse(NetworkPathTransition.isRestoration(wasSatisfied: false, isSatisfied: false))
    }
}
