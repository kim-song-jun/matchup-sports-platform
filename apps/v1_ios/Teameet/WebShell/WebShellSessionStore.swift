import Foundation

/// Persists the browsing session between launches.
///
/// Foundation only, and the build and OS version are injected rather than read from
/// `UIDevice`, so the whole round trip — including the refusals — can be exercised by
/// tests.
struct WebShellSessionStore {

    static let defaultsKey = "kr.co.teameet.webshell.session"

    private let defaults: UserDefaults
    private let appBuild: String
    private let osMajorVersion: Int

    init(defaults: UserDefaults, appBuild: String, osMajorVersion: Int) {
        self.defaults = defaults
        self.appBuild = appBuild
        self.osMajorVersion = osMajorVersion
    }

    /// Returns the stored interaction state, or `nil` when there is nothing usable — which
    /// the shell reads as "start at /home".
    func load() -> Data? {
        WebShellSession.restore(
            from: defaults.data(forKey: Self.defaultsKey),
            currentAppBuild: appBuild,
            currentOSMajorVersion: osMajorVersion)
    }

    func save(_ interactionState: Data?) {
        guard let interactionState, !interactionState.isEmpty else {
            clear()
            return
        }
        let session = WebShellSession(
            appBuild: appBuild,
            osMajorVersion: osMajorVersion,
            interactionState: interactionState)
        guard let encoded = session.encoded() else {
            clear()
            return
        }
        defaults.set(encoded, forKey: Self.defaultsKey)
    }

    func clear() {
        defaults.removeObject(forKey: Self.defaultsKey)
    }
}
