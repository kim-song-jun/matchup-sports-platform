import Foundation

/// Which APNs gateway will issue this build's device token.
///
/// The server needs this because a token only works at the gateway that issued it. Send a
/// sandbox token to the production gateway and Apple answers `BadDeviceToken`, which the
/// server classifies as permanent and revokes the registration — so guessing wrong does not
/// merely drop a notification, it unregisters the device.
///
/// **Read from the signed profile, not from the build configuration.** The obvious source is
/// `TEAMEET_APS_ENVIRONMENT`, which the xcconfig already carries and which is how every other
/// build value reaches the app. It is wrong here, and measurably so: preparing the first
/// TestFlight build, `Config/Alpha.xcconfig` said `development` while the App Store profile
/// granted `production`, and Xcode substituted the profile's value into the signed binary.
/// A build constant describes what was asked for; only the profile says what was signed.
enum ApnsEnvironment: String, Equatable, Sendable {

    /// `api.sandbox.push.apple.com` — a build installed from Xcode, and the simulator.
    case sandbox
    /// `api.push.apple.com` — TestFlight and the App Store.
    case production

    /// What this build is actually signed for.
    ///
    /// Three cases, and the third one was wrong until now. The simulator is always a sandbox
    /// client and carries no profile, so it is answered without looking at anything. A build
    /// installed from Xcode or ad hoc carries `embedded.mobileprovision`, and its
    /// `aps-environment` is the answer. A build delivered by TestFlight or the App Store is
    /// re-signed by Apple and its profile may not be readable here at all — on a device that
    /// absence is not "unknown", it is the store, and the store is production.
    ///
    /// **Measured**: TestFlight 0.1.3 (5) registered as `sandbox`. Alpha therefore addressed
    /// the sandbox gateway, Apple answered `BadDeviceToken`, and the reader saw nothing —
    /// for two days, with no log line anywhere. The old fallback chose sandbox on the
    /// reasoning that guessing production would get a working device revoked; the server now
    /// tries the other gateway before revoking, so that cost is gone while this one was
    /// certain.
    static var current: ApnsEnvironment {
        #if targetEnvironment(simulator)
        return .sandbox
        #else
        return resolve(profileAt: Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"))
        #endif
    }

    /// The environment a **device** build reports. Not reached on the simulator, where the
    /// absence of a profile means sandbox rather than the store.
    static func resolve(profileAt url: URL?) -> ApnsEnvironment {
        guard let url, let data = try? Data(contentsOf: url) else { return .production }
        return resolve(profile: data)
    }

    /// Reads `aps-environment` out of a provisioning profile.
    ///
    /// The file is CMS-signed, so the plist sits inside a binary envelope. Rather than pull
    /// in a CMS decoder for one string, the plist is located by its own delimiters — the same
    /// approach Apple's own sample code uses — and parsed from there.
    static func resolve(profile data: Data) -> ApnsEnvironment {
        guard let plist = embeddedPlist(in: data),
              let parsed = try? PropertyListSerialization.propertyList(from: plist, format: nil),
              let root = parsed as? [String: Any],
              let entitlements = root["Entitlements"] as? [String: Any],
              let value = entitlements["aps-environment"] as? String
        else { return .production }
        // Apple spells the sandbox gateway "development" in the entitlement. Only that word
        // means sandbox; anything else — including a value this build does not recognise —
        // is treated as the store, for the same reason as a missing profile above. A device
        // build that reaches here at all was signed by somebody, and the only signer whose
        // profile we cannot read is Apple's.
        return value == "development" ? .sandbox : .production
    }

    private static func embeddedPlist(in data: Data) -> Data? {
        guard let open = "<?xml".data(using: .utf8),
              let close = "</plist>".data(using: .utf8),
              let start = data.range(of: open),
              let end = data.range(of: close, in: start.lowerBound..<data.endIndex)
        else { return nil }
        return data.subdata(in: start.lowerBound..<end.upperBound)
    }
}
