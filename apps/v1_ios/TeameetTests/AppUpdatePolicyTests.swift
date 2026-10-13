import XCTest

final class AppUpdatePolicyTests: XCTestCase {
    func testComparesNumericVersionsInsteadOfLexically() {
        XCTAssertEqual(AppUpdatePolicy.compareVersions("0.1.10", "0.1.9"), .orderedDescending)
        XCTAssertEqual(AppUpdatePolicy.compareVersions("0.1", "0.1.0"), .orderedSame)
        XCTAssertNil(AppUpdatePolicy.compareVersions("0.x.1", "0.1.0"))
        XCTAssertNil(AppUpdatePolicy.compareVersions("0..1", "0.1.0"))
    }

    func testRequiresOnlyAValidNewerCompatibleKoreanListing() throws {
        let newer = try lookup(version: "0.1.10", minimumOS: "16.0")
        XCTAssertEqual(AppUpdatePolicy.decide(
            data: newer, httpStatus: 200, installedVersion: "0.1.9", currentOSVersion: "18.0").status,
            .updateRequired)
        XCTAssertEqual(AppUpdatePolicy.decide(
            data: newer, httpStatus: 200, installedVersion: "0.1.10", currentOSVersion: "18.0").status,
            .upToDate)
        XCTAssertEqual(AppUpdatePolicy.decide(
            data: newer, httpStatus: 200, installedVersion: "0.1.9", currentOSVersion: "15.0").status,
            .unavailable)
    }

    func testRejectsWrongTrackBundleMalformedVersionAndNonSuccessHTTP() throws {
        for record in [
            ["trackId": 1, "bundleId": "kr.co.teameet", "version": "0.1.10", "minimumOsVersion": "16.0"],
            ["trackId": AppUpdatePolicy.trackID, "bundleId": "kr.co.other", "version": "0.1.10", "minimumOsVersion": "16.0"],
            ["trackId": AppUpdatePolicy.trackID, "bundleId": "kr.co.teameet", "version": "0.1.x", "minimumOsVersion": "16.0"],
        ] as [[String: Any]] {
            let result = AppUpdatePolicy.decide(
                data: try JSONSerialization.data(withJSONObject: ["results": [record]]),
                httpStatus: 200, installedVersion: "0.1.9", currentOSVersion: "18.0")
            XCTAssertEqual(result.status, .unavailable)
        }
        XCTAssertEqual(AppUpdatePolicy.decide(
            data: Data(), httpStatus: 503, installedVersion: "0.1.9", currentOSVersion: "18.0").status,
            .unavailable)
    }

    func testUnknownAndUnsupportedStorefrontsStayUnavailableWithoutNetwork() async {
        let checker = AppUpdateChecker()
        let unknown = await checker.check(installedVersion: "0.1.5", storefrontCountry: nil)
        let unsupported = await checker.check(installedVersion: "0.1.5", storefrontCountry: "USA")
        XCTAssertEqual(unknown.status, .unavailable)
        XCTAssertEqual(unsupported.status, .unavailable)
    }

    private func lookup(version: String, minimumOS: String) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["results": [[
            "trackId": AppUpdatePolicy.trackID,
            "bundleId": AppUpdatePolicy.bundleID,
            "version": version,
            "minimumOsVersion": minimumOS,
        ]]])
    }
}
