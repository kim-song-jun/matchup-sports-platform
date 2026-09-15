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

    /// Whether this error is a navigation that was called off rather than one that failed.
    static func isCancellation(_ error: NSError) -> Bool {
        if error.domain == NSURLErrorDomain, error.code == urlErrorCancelled { return true }
        if error.domain == webKitErrorDomain,
           error.code == webKitErrorFrameLoadInterruptedByPolicyChange { return true }
        return false
    }

    static func isCancellation(_ error: Error) -> Bool { isCancellation(error as NSError) }

    /// Whether a failed navigation should surface the error screen.
    ///
    /// A cancellation is normally not worth showing — but "normally" is doing real work
    /// here, and getting it wrong is how the shell ends up blank.
    ///
    /// Every cancellation the shell sees is one it caused: handing a link to Safari,
    /// intercepting a 5xx, or turning a response into a download all return `.cancel` and
    /// WebKit answers with `WebKitErrorDomain 102`. Suppressing all of them is right only
    /// while there is still something on screen. When the cancelled navigation was the
    /// first one — a cold start whose initial load redirects off-origin, or a server that
    /// serves the main document as a download — suppressing it leaves a blank window with
    /// no way out. Measured: that screen is a single flat white, and the retry affordance
    /// this shell exists to provide never appears.
    ///
    /// - Parameters:
    ///   - hasVisibleContent: whether the web view still shows a page the user can use.
    ///   - isAlreadyPresentingFailure: whether a failure is already on screen. The 5xx path
    ///     sets its reason first and is then followed by a 102; without this the follow-up
    ///     would overwrite an accurate server-error message with a generic one.
    static func shouldPresentFailure(
        for error: NSError,
        hasVisibleContent: Bool,
        isAlreadyPresentingFailure: Bool
    ) -> Bool {
        guard isCancellation(error) else { return true }
        if isAlreadyPresentingFailure { return false }
        return !hasVisibleContent
    }

    static func shouldPresentFailure(
        for error: Error,
        hasVisibleContent: Bool,
        isAlreadyPresentingFailure: Bool
    ) -> Bool {
        shouldPresentFailure(
            for: error as NSError,
            hasVisibleContent: hasVisibleContent,
            isAlreadyPresentingFailure: isAlreadyPresentingFailure)
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
    /// The navigation was called off and left nothing behind — the destination went to
    /// Safari, or the response was a file rather than a page. Distinct from the network
    /// cases because the network is fine and saying otherwise would send the reader to
    /// check Wi-Fi for no reason.
    case interrupted

    /// Maps an error onto the reason to show.
    ///
    /// A cancellation only reaches here when there is nothing left on screen, so it always
    /// means the interrupted case.
    static func forFailure(_ error: NSError) -> WebShellFailureReason {
        WebShellFailurePolicy.isCancellation(error) ? .interrupted : .from(error: error)
    }

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
        // Neither of these is a connectivity problem, so regaining the network changes
        // nothing about them.
        case .serverError, .interrupted: return false
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
