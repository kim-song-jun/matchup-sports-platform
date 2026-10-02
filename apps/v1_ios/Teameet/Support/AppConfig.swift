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
        static let appVersion = "CFBundleShortVersionString"
        static let buildNumber = "CFBundleVersion"
    }

    /// The one origin this build is allowed to load. Everything else is external.
    let webOrigin: String

    /// Alpha exposes the embedded page to Safari's Web Inspector; production never does,
    /// whatever the build type. Android pins the same guarantee in `BuildConfig`.
    let webViewInspectable: Bool

    /// Reported with a push registration so a delivery failure can be traced to a release.
    /// Comes from `version.properties` by way of `MARKETING_VERSION`.
    let appVersion: String

    /// Used to decide whether a persisted browsing session was written by this build.
    let buildNumber: String


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
        appVersion = string(Key.appVersion)
        buildNumber = string(Key.buildNumber)
    }

    /// The URL the shell opens for a sanitised route.
    func url(forRoute route: String) -> URL? {
        URL(string: webOrigin + route)
    }
}
