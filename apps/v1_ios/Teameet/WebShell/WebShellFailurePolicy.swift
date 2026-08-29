import Foundation

/// Decides when a navigation problem is worth showing the user an error screen.
///
/// Two things make this less obvious than it looks, and both were the source of real
/// misbehaviour in shells like this one:
///
/// 1. **`WKWebView` does not report an HTTP 5xx as a failure.** A 500 arrives as a
///    successfully loaded page, so `didFailProvisionalNavigation` never fires and the user
///    is left on whatever the server rendered. Catching it means inspecting the status code
///    in `decidePolicyFor navigationResponse` instead.
/// 2. **A cancelled navigation reports itself as an error.** Tapping a second link while
///    the first is still loading cancels the first, and every navigation the shell hands to
///    Safari cancels itself by design. Treating those as failures would flash an error
///    screen during entirely normal use.
///
/// Keeping the rules here, free of WebKit types, is what lets both be pinned by tests.
enum WebShellFailurePolicy {

    /// Status codes at or above this are treated as the site being broken.
    ///
    /// Deliberately 500, not 400. The v1 web app renders its own pages for client errors —
    /// a Next.js not-found is a real screen served with a 404 — so intercepting 4xx would
    /// replace working product screens with a shell error. A 5xx has no page behind it.
    static let serverErrorStatusCode = 500

    /// `NSURLErrorDomain` code for a navigation the app or the user cancelled.
    static let urlErrorCancelled = -999

    /// `WebKitErrorDomain` code raised when a policy decision stops a navigation — which is
    /// exactly what the shell does every time it hands a link to Safari.
    static let webKitErrorFrameLoadInterruptedByPolicyChange = 102
    static let webKitErrorDomain = "WebKitErrorDomain"

    /// Whether a failed navigation should surface the error screen.
    static func shouldPresentFailure(for error: NSError) -> Bool {
        if error.domain == NSURLErrorDomain, error.code == urlErrorCancelled { return false }
        if error.domain == webKitErrorDomain,
           error.code == webKitErrorFrameLoadInterruptedByPolicyChange { return false }
        return true
    }

    static func shouldPresentFailure(for error: Error) -> Bool {
        shouldPresentFailure(for: error as NSError)
    }

    /// Whether a main-frame response should be replaced by the error screen.
    ///
    /// Sub-frame responses are ignored: a failing analytics iframe must not take down a
    /// page the user can otherwise read.
    static func shouldPresentFailure(forStatusCode statusCode: Int, isMainFrame: Bool) -> Bool {
        isMainFrame && statusCode >= serverErrorStatusCode
    }

    /// Whether an error means the device could not reach the network at all, as opposed to
    /// reaching it and being told no.
    ///
    /// Only the first kind is worth retrying automatically when connectivity returns; a
    /// server that is down stays down whether or not Wi-Fi came back.
    static func isConnectivityFailure(_ error: NSError) -> Bool {
        guard error.domain == NSURLErrorDomain else { return false }
        switch error.code {
        case NSURLErrorNotConnectedToInternet,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorCannotFindHost,
             NSURLErrorCannotConnectToHost,
             NSURLErrorDNSLookupFailed,
             NSURLErrorTimedOut,
             NSURLErrorInternationalRoamingOff,
             NSURLErrorDataNotAllowed:
            return true
        default:
            return false
        }
    }

    static func isConnectivityFailure(_ error: Error) -> Bool {
        isConnectivityFailure(error as NSError)
    }
}

/// Why the shell is showing an error screen. The distinction drives the copy: a phone with
/// no signal and a server returning 500 need different things from the reader.
enum WebShellFailureReason: Equatable {
    /// The device could not reach the network.
    case offline
    /// The network was reachable but the request did not complete.
    case unreachable
    /// The server answered, with a 5xx.
    case serverError(statusCode: Int)

    static func from(error: NSError) -> WebShellFailureReason {
        if error.domain == NSURLErrorDomain,
           error.code == NSURLErrorNotConnectedToInternet
            || error.code == NSURLErrorDataNotAllowed
            || error.code == NSURLErrorInternationalRoamingOff {
            return .offline
        }
        return .unreachable
    }

    /// Whether regaining the network should reload without waiting for the user.
    ///
    /// A server error is excluded on purpose: the site is still broken when Wi-Fi comes
    /// back, so an automatic reload would add load during an outage and leave the user
    /// watching the same screen anyway. Those keep the manual button and nothing else.
    var isRetriableOnReconnect: Bool {
        switch self {
        case .offline, .unreachable: return true
        case .serverError: return false
        }
    }
}

/// The rule for what counts as the network coming back.
///
/// It lives here, apart from `NWPathMonitor`, because `NWPath` values cannot be constructed
/// in a test and this is the part worth pinning.
enum NetworkPathTransition {

    /// Only the edge into a satisfied path counts.
    ///
    /// `NWPathMonitor` delivers an update for every change, including ones that leave the
    /// path satisfied throughout. Reloading on each of those would retry continuously while
    /// connected — exactly the behaviour that turns a server outage into a stampede.
    static func isRestoration(wasSatisfied: Bool, isSatisfied: Bool) -> Bool {
        isSatisfied && !wasSatisfied
    }
}
