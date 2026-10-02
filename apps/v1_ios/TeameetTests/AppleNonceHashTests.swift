import XCTest

/// The server compares Apple's echoed nonce against `SHA256(raw)` in lower-case hex. If this
/// side ever produced a different shape — upper case, base64, the raw value — every Apple
/// sign-in would be refused with a message that points nowhere near the cause.
final class AppleNonceHashTests: XCTestCase {

    /// A known vector, so a change in encoding fails here rather than in production.
    func testHashesToLowercaseHexSha256() {
        XCTAssertEqual(
            AppleNonceHash.hex(of: "abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    func testProducesSixtyFourHexCharacters() {
        let hash = AppleNonceHash.hex(of: "a1.random.1893456000.signature")

        XCTAssertEqual(hash.count, 64)
        XCTAssertTrue(hash.allSatisfy { $0.isHexDigit && !$0.isUppercase })
    }

    func testDifferentNoncesHashDifferently() {
        XCTAssertNotEqual(AppleNonceHash.hex(of: "one"), AppleNonceHash.hex(of: "two"))
    }
}
