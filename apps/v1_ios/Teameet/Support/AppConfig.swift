import Foundation

/// The environment contract a build carries, read from `Info.plist`.
///
/// This is the iOS counterpart of Android's generated `BuildConfig`. `Config/Alpha.xcconfig`
/// and `Config/Production.xcconfig` supply the values, `project.yml`'s `info:` block turns
/// them into `$(VAR)` placeholders, and Xcode substitutes them at build time.
///
/// The initialiser takes a `Bundle` so tests can assert against a dictionary instead of
/// whichever bundle happens to be `.main`.
struct AppConfig: Equatable {

    enum Key {
        static let webOrigin = "TeameetWebOrigin"
        static let webViewInspectable = "TeameetWebViewInspectable"
        static let firebaseProjectId = "TeameetFirebaseProjectId"
        static let firebaseAppId = "TeameetFirebaseAppId"
        static let firebaseApiKey = "TeameetFirebaseApiKey"
        static let firebaseSenderId = "TeameetFirebaseSenderId"
    }

    /// The one origin this build is allowed to load. Everything else is external.
    let webOrigin: String

    /// Alpha exposes the embedded page to Safari's Web Inspector; production never does,
    /// whatever the build type. Android pins the same guarantee in `BuildConfig`.
    let webViewInspectable: Bool

    let firebaseProjectId: String
    let firebaseAppId: String
    let firebaseApiKey: String
    let firebaseSenderId: String

    /// Whether Firebase can be configured at all. Any missing value means push stays off
    /// and the shell still works, matching `FirebaseBootstrap.initialize()` on Android,
    /// which returns false when any of the four identifiers is blank.
    var isFirebaseConfigured: Bool {
        ![firebaseProjectId, firebaseAppId, firebaseApiKey, firebaseSenderId]
            .contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    static let main = AppConfig(bundle: .main)

    init(bundle: Bundle) {
        self.init(infoDictionary: bundle.infoDictionary ?? [:])
    }

    init(infoDictionary: [String: Any]) {
        func string(_ key: String) -> String {
            (infoDictionary[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        webOrigin = string(Key.webOrigin)
        // xcconfig delivers this as the literal string YES or NO, not a plist boolean,
        // because the value reaches Info.plist through $(VAR) substitution.
        webViewInspectable = string(Key.webViewInspectable).caseInsensitiveCompare("YES") == .orderedSame
        firebaseProjectId = string(Key.firebaseProjectId)
        firebaseAppId = string(Key.firebaseAppId)
        firebaseApiKey = string(Key.firebaseApiKey)
        firebaseSenderId = string(Key.firebaseSenderId)
    }

    /// The URL the shell opens for a sanitised route.
    func url(forRoute route: String) -> URL? {
        URL(string: webOrigin + route)
    }
}
