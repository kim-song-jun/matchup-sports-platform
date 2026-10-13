import Foundation

/// Validates the public App Store lookup response and applies the iOS update policy.
/// Store data is external input: malformed or mismatched records never imply an update.
enum AppUpdatePolicy {
    static let trackID = 6_809_736_050
    static let bundleID = "kr.co.teameet"

    enum Status: String, Sendable {
        case updateRequired = "update-required"
        case upToDate = "up-to-date"
        case unavailable
    }

    struct Decision: Equatable, Sendable {
        let status: Status
        let availableVersion: String?
        let error: String?
    }

    static func decide(
        data: Data,
        httpStatus: Int,
        installedVersion: String,
        currentOSVersion: String
    ) -> Decision {
        guard httpStatus == 200 else { return unavailable("store returned HTTP \(httpStatus)") }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = object["results"] as? [[String: Any]],
              results.count == 1,
              let record = results.first,
              let trackID = (record["trackId"] as? NSNumber)?.intValue,
              trackID == Self.trackID,
              record["bundleId"] as? String == Self.bundleID,
              let available = record["version"] as? String,
              let minimumOS = record["minimumOsVersion"] as? String,
              compareVersions(available, installedVersion) != nil,
              compareVersions(minimumOS, currentOSVersion) != nil else {
            return unavailable("store response did not match the supported app")
        }
        guard compareVersions(minimumOS, currentOSVersion) != .orderedDescending else {
            return unavailable("available app requires a newer iOS version")
        }
        return Decision(
            status: compareVersions(available, installedVersion) == .orderedDescending
                ? .updateRequired : .upToDate,
            availableVersion: available,
            error: nil)
    }

    /// Compares numeric dot-separated versions, so 0.1.10 sorts after 0.1.9.
    /// `nil` means either input was malformed or too large to compare safely.
    static func compareVersions(_ lhs: String, _ rhs: String) -> ComparisonResult? {
        func components(_ value: String) -> [UInt64]? {
            let parts = value.split(separator: ".", omittingEmptySubsequences: false)
            guard !parts.isEmpty else { return nil }
            let parsed = parts.compactMap { part -> UInt64? in
                guard !part.isEmpty, part.allSatisfy(\.isNumber),
                      part.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
                return UInt64(part)
            }
            return parsed.count == parts.count ? parsed : nil
        }
        guard let left = components(lhs), let right = components(rhs) else { return nil }
        for index in 0..<max(left.count, right.count) {
            let a = index < left.count ? left[index] : 0
            let b = index < right.count ? right[index] : 0
            if a < b { return .orderedAscending }
            if a > b { return .orderedDescending }
        }
        return .orderedSame
    }

    private static func unavailable(_ error: String) -> Decision {
        Decision(status: .unavailable, availableVersion: nil, error: error)
    }
}
