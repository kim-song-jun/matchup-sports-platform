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

    /// Tapping a second link while the first is still loading cancels the first, and every
    /// link the shell hands to Safari cancels its own navigation by design. Showing an error
    /// screen for either would fire during completely normal use.
    func testDoesNotPresentFailureForCancelledNavigations() {
        XCTAssertFalse(WebShellFailurePolicy.shouldPresentFailure(
            for: urlError(WebShellFailurePolicy.urlErrorCancelled)))
        XCTAssertFalse(WebShellFailurePolicy.shouldPresentFailure(for: urlError(NSURLErrorCancelled)))
        XCTAssertFalse(WebShellFailurePolicy.shouldPresentFailure(for: NSError(
            domain: WebShellFailurePolicy.webKitErrorDomain,
            code: WebShellFailurePolicy.webKitErrorFrameLoadInterruptedByPolicyChange)))
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
                WebShellFailurePolicy.shouldPresentFailure(for: urlError(code)),
                "URL error \(code) should surface the error screen")
        }
    }

    /// -999 in another domain is a different error entirely; only `NSURLErrorDomain` and the
    /// WebKit policy code are cancellations.
    func testOnlySuppressesCancellationsFromTheirOwnDomains() {
        XCTAssertTrue(WebShellFailurePolicy.shouldPresentFailure(
            for: NSError(domain: "kr.co.teameet.Something", code: -999)))
        XCTAssertTrue(WebShellFailurePolicy.shouldPresentFailure(
            for: NSError(domain: WebShellFailurePolicy.webKitErrorDomain, code: 101)))
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
