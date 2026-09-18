import Foundation

/// Which downloads the shell will write to disk.
///
/// Two decisions, taken at two different moments against two different URLs, and conflating
/// them is what made the second one useless: the check at the destination step used to read
/// the *request* URL again, so it could only ever agree with the first check. A link on our
/// origin that redirects elsewhere passed both, and the file that landed came from the
/// redirect target while the download carried the web view's session cookies.
///
/// Kept free of WebKit so both decisions can be tested — `WKDownload` and `URLResponse`
/// cannot be constructed in a unit test.
enum DownloadPolicy {

    /// Before anything is fetched: the URL the download starts from must be ours.
    ///
    /// Refusing here rather than at the destination step means a download that was never
    /// ours does not get fetched at all.
    static func allowsStart(requestURL: URL?, origin: String) -> Bool {
        AllowedNavigation.isInternal(requestURL, origin: origin)
    }

    /// Before the bytes are written: the URL that actually answered must be ours too.
    ///
    /// `responseURL` is the URL after any redirects, which is the only one that says where
    /// the file is really coming from. A missing one is refused rather than assumed — the
    /// shell cannot verify what it cannot see.
    static func allowsWrite(requestURL: URL?, responseURL: URL?, origin: String) -> Bool {
        guard allowsStart(requestURL: requestURL, origin: origin) else { return false }
        guard let responseURL else { return false }
        return AllowedNavigation.isInternal(responseURL, origin: origin)
    }
}
