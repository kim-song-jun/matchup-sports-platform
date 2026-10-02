import XCTest

/// Pins the one thing the server cannot work out for itself: which APNs gateway issued this
/// build's token.
///
/// Getting it wrong is not a dropped notification. A token sent to the wrong gateway comes
/// back `BadDeviceToken`, which the server treats as permanent and uses to revoke the
/// registration — a working device silently unregisters itself.
final class ApnsEnvironmentTests: XCTestCase {

    /// A provisioning profile is a CMS envelope with a plist inside, so the parser has to
    /// find the plist among surrounding bytes rather than decode the whole file.
    private func profile(withApsEnvironment value: String?) -> Data {
        let entitlement = value.map { "<key>aps-environment</key><string>\($0)</string>" } ?? ""
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict>
          <key>Name</key><string>Teameet Alpha App Store</string>
          <key>Entitlements</key><dict>
            <key>application-identifier</key><string>U9J95Q6XD3.kr.co.teameet.alpha</string>
            \(entitlement)
          </dict>
        </dict></plist>
        """
        var data = Data([0x30, 0x82, 0x0A, 0xBC])       // CMS header bytes, as in a real file
        data.append(plist.data(using: .utf8)!)
        data.append(Data([0x00, 0x01, 0x02, 0x03]))      // the signature that follows the plist
        return data
    }

    func testReadsProductionFromASignedProfile() {
        XCTAssertEqual(ApnsEnvironment.resolve(profile: profile(withApsEnvironment: "production")), .production)
    }

    /// Apple spells the sandbox gateway "development" in the entitlement itself.
    func testReadsDevelopmentAsSandbox() {
        XCTAssertEqual(ApnsEnvironment.resolve(profile: profile(withApsEnvironment: "development")), .sandbox)
    }

    /// The case that was wrong, and cost the reader two days of silence.
    ///
    /// A **device** build with no readable profile is a store build: TestFlight and the App
    /// Store re-sign the app, and what reaches the device may not be readable here. Reporting
    /// sandbox there sent every notification to the wrong gateway, where Apple answered
    /// `BadDeviceToken` and the server wrote the device off. The simulator, which also has no
    /// profile, never reaches this function — `current` answers it before looking.
    func testTreatsAMissingProfileOnADeviceAsProduction() {
        XCTAssertEqual(ApnsEnvironment.resolve(profileAt: nil), .production)
    }

    func testTreatsAProfileWithoutTheEntitlementAsProduction() {
        XCTAssertEqual(ApnsEnvironment.resolve(profile: profile(withApsEnvironment: nil)), .production)
    }

    /// Only Apple's own spelling of the sandbox gateway means sandbox. Anything else is a
    /// value this build does not understand, and on a device the safer reading is the store —
    /// the server probes the other gateway before revoking anything.
    func testTreatsAnUnknownValueAsProduction() {
        XCTAssertEqual(ApnsEnvironment.resolve(profile: profile(withApsEnvironment: "staging")), .production)
    }

    func testTreatsUnparseableBytesAsProduction() {
        XCTAssertEqual(ApnsEnvironment.resolve(profile: Data([0xDE, 0xAD, 0xBE, 0xEF])), .production)
    }

    /// The simulator is always a sandbox client, and it is where this bundle runs — so the
    /// assertion is about the value the shell would actually report here.
    func testTheSimulatorReportsSandboxWithoutReadingAProfile() {
        XCTAssertEqual(ApnsEnvironment.current, .sandbox)
    }

    /// The registration body is what the server actually reads.
    func testTheRegistrationBodyCarriesTheGateway() throws {
        let registration = PushDeviceRegistration(
            installationId: UUID(),
            deviceToken: Data(repeating: 0xAB, count: 32),
            appVersion: "0.1.0",
            deviceModel: "iPhone",
            apnsEnvironment: .production)

        let body = try XCTUnwrap(registration.jsonBody())
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["apnsEnvironment"] as? String, "production")
        XCTAssertEqual(json["platform"] as? String, "ios")
    }
}
