import Foundation

/// Persisted browsing session, so reopening the app returns the user to the screen they
/// were on rather than to the home tab.
///
/// This mirrors `MainActivity`'s `webView.saveState(outState)` /
/// `webView.restoreState(savedInstanceState)` pair. On iOS the equivalent is
/// `WKWebView.interactionState`, which serialises the back/forward list and scroll position.
///
/// The payload is opaque WebKit data whose format Apple owns, so it is wrapped in an
/// envelope that records which app build and which OS major version produced it. After an
/// app or OS update the envelope no longer matches and the shell starts fresh at `/home`
/// instead of handing WebKit bytes it may no longer understand. That check is the reason
/// this type exists rather than storing the raw `Data`.
struct WebShellSession: Equatable {

    /// Bumped by hand if the envelope's own shape ever changes.
    static let formatMarker = "teameet.webshell.session.v1"

    let appBuild: String
    let osMajorVersion: Int
    let interactionState: Data

    init(appBuild: String, osMajorVersion: Int, interactionState: Data) {
        self.appBuild = appBuild
        self.osMajorVersion = osMajorVersion
        self.interactionState = interactionState
    }

    /// Whether a snapshot taken while `url` is showing is worth restoring at the next launch.
    ///
    /// The login screens are a detour — they have no tab bar and nothing to go back to once
    /// the app has been relaunched — so a snapshot taken there is skipped and the previous one
    /// (the screen the reader was on before being sent to log in) stays in place.
    static func isRestorableLocation(_ url: URL?) -> Bool {
        guard let path = url?.path else { return true }
        return path != "/login" && !path.hasPrefix("/login/")
    }

    func encoded() -> Data? {
        let envelope: [String: Any] = [
            "marker": Self.formatMarker,
            "appBuild": appBuild,
            "osMajorVersion": osMajorVersion,
            "interactionState": interactionState,
        ]
        return try? PropertyListSerialization.data(
            fromPropertyList: envelope, format: .binary, options: 0)
    }

    /// Returns the stored interaction state only when it came from this exact build on this
    /// OS major version. Every other outcome — corrupt data, a stale marker, a different
    /// build, an empty payload — returns `nil`, which the caller reads as "load `/home`".
    static func restore(
        from data: Data?,
        currentAppBuild: String,
        currentOSMajorVersion: Int
    ) -> Data? {
        guard let data,
              let plist = try? PropertyListSerialization.propertyList(
                  from: data, options: [], format: nil),
              let envelope = plist as? [String: Any],
              envelope["marker"] as? String == formatMarker,
              envelope["appBuild"] as? String == currentAppBuild,
              envelope["osMajorVersion"] as? Int == currentOSMajorVersion,
              let interactionState = envelope["interactionState"] as? Data,
              !interactionState.isEmpty
        else { return nil }
        return interactionState
    }
}
