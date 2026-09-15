import XCTest

/// Pins the restore path that keeps the user on the screen they were reading, and — more
/// importantly — the cases where restoring must be abandoned quietly.
///
/// `interactionState` is opaque WebKit data. Handing WebKit a payload from a different app
/// build or OS version is not something the shell can validate, so the envelope refuses it
/// instead. Every refusal has to land on `/home`, never on a crash.
final class WebShellSessionTests: XCTestCase {

    private let build = "42"
    private let osMajor = 18
    private let payload = Data([0x62, 0x70, 0x6C, 0x69, 0x73, 0x74, 0x00, 0x01])

    private func envelope(build: String? = nil, os: Int? = nil, state: Data? = nil) -> Data {
        let session = WebShellSession(
            appBuild: build ?? self.build,
            osMajorVersion: os ?? osMajor,
            interactionState: state ?? payload)
        guard let encoded = session.encoded() else {
            XCTFail("envelope failed to encode")
            return Data()
        }
        return encoded
    }

    func testRestoresStateWrittenByTheSameBuildAndOs() {
        let restored = WebShellSession.restore(
            from: envelope(), currentAppBuild: build, currentOSMajorVersion: osMajor)
        XCTAssertEqual(restored, payload)
    }

    /// An app update can change what WebKit expects, so a payload from the previous build is
    /// dropped rather than replayed.
    func testDropsStateFromAnotherAppBuild() {
        XCTAssertNil(WebShellSession.restore(
            from: envelope(build: "41"), currentAppBuild: build, currentOSMajorVersion: osMajor))
    }

    /// The serialisation format belongs to the OS, not to this app.
    func testDropsStateFromAnotherOsMajorVersion() {
        XCTAssertNil(WebShellSession.restore(
            from: envelope(os: 17), currentAppBuild: build, currentOSMajorVersion: osMajor))
    }

    func testDropsCorruptOrEmptyInput() {
        XCTAssertNil(WebShellSession.restore(
            from: nil, currentAppBuild: build, currentOSMajorVersion: osMajor))
        XCTAssertNil(WebShellSession.restore(
            from: Data(), currentAppBuild: build, currentOSMajorVersion: osMajor))
        XCTAssertNil(WebShellSession.restore(
            from: Data("not a plist".utf8), currentAppBuild: build, currentOSMajorVersion: osMajor))
        XCTAssertNil(WebShellSession.restore(
            from: envelope(state: Data()), currentAppBuild: build, currentOSMajorVersion: osMajor))
    }

    /// A plist that parses but is not one of ours — for example a value written by an
    /// earlier envelope format — must not be mistaken for interaction state.
    func testDropsAPlistThatIsNotOurEnvelope() {
        let foreign = try? PropertyListSerialization.data(
            fromPropertyList: ["marker": "something.else", "interactionState": payload],
            format: .binary,
            options: 0)
        XCTAssertNotNil(foreign)
        XCTAssertNil(WebShellSession.restore(
            from: foreign, currentAppBuild: build, currentOSMajorVersion: osMajor))

        let noMarker = try? PropertyListSerialization.data(
            fromPropertyList: ["appBuild": build, "interactionState": payload],
            format: .binary,
            options: 0)
        XCTAssertNil(WebShellSession.restore(
            from: noMarker, currentAppBuild: build, currentOSMajorVersion: osMajor))
    }

    func testRoundTripsALargeBackForwardList() {
        let large = Data(repeating: 0xAB, count: 256 * 1024)
        let restored = WebShellSession.restore(
            from: envelope(state: large), currentAppBuild: build, currentOSMajorVersion: osMajor)
        XCTAssertEqual(restored, large)
    }
}
