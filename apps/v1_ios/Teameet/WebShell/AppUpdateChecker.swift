import Foundation
import StoreKit

/// Uses Apple's public listing only for the supported Korean storefront.
/// Alpha, unknown storefronts and transport or response failures remain unavailable.
struct AppUpdateChecker {
    func check(installedVersion: String, storefrontCountry: String?) async -> AppUpdatePolicy.Decision {
        guard storefrontCountry == "KOR" else {
            return AppUpdatePolicy.Decision(
                status: .unavailable, availableVersion: nil,
                error: storefrontCountry == nil ? "storefront unavailable" : "unsupported storefront")
        }
        guard let url = URL(string: "https://itunes.apple.com/lookup?id=6809736050&country=kr") else {
            return AppUpdatePolicy.Decision(status: .unavailable, availableVersion: nil, error: "invalid store URL")
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
        request.httpMethod = "GET"
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 8
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            return AppUpdatePolicy.decide(
                data: data,
                httpStatus: status,
                installedVersion: installedVersion,
                currentOSVersion: Self.currentOSVersion)
        } catch is CancellationError {
            return AppUpdatePolicy.Decision(status: .unavailable, availableVersion: nil, error: "cancelled")
        } catch {
            return AppUpdatePolicy.Decision(
                status: .unavailable, availableVersion: nil, error: "store lookup failed: \(error.localizedDescription)")
        }
    }

    func check(installedVersion: String) async -> AppUpdatePolicy.Decision {
        let storefront = await Storefront.current
        return await check(installedVersion: installedVersion, storefrontCountry: storefront?.countryCode)
    }

    private static var currentOSVersion: String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
    }
}
