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
    /// A simulator build has no embedded profile, and the simulator is a sandbox client, so
    /// the absence is not a failure to report — it is the answer.
    static var current: ApnsEnvironment {
        resolve(profileAt: Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"))
    }

    static func resolve(profileAt url: URL?) -> ApnsEnvironment {
        guard let url, let data = try? Data(contentsOf: url) else { return .sandbox }
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
        else { return .sandbox }
        // Apple spells the sandbox value "development" in the entitlement. Anything else
        // unrecognised falls back to sandbox: a wrong guess towards production would get a
        // working device revoked, while a wrong guess towards sandbox only fails to deliver.
        return value == "production" ? .production : .sandbox
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
