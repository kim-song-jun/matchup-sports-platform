import XCTest

/// Which downloads the shell agrees to write to disk.
///
/// A `WKDownload` carries the web view's cookies, so a file it fetches is fetched as the
/// signed-in reader. That is why the origin is checked twice — and why checking the same URL
/// twice, which is what the code did, is the same as checking once.
final class DownloadPolicyTests: XCTestCase {

    private let origin = "https://alpha.teameet.co.kr"
    private func url(_ text: String) -> URL? { URL(string: text) }

    // MARK: - Before fetching

    func testStartsOnlyFromOurOwnOrigin() {
        XCTAssertTrue(DownloadPolicy.allowsStart(
            requestURL: url("https://alpha.teameet.co.kr/files/report.pdf"), origin: origin))
        XCTAssertFalse(DownloadPolicy.allowsStart(
            requestURL: url("https://attacker.example/report.pdf"), origin: origin))
        XCTAssertFalse(DownloadPolicy.allowsStart(requestURL: nil, origin: origin))
    }

    // MARK: - Before writing

    /// The case the second check exists for, and the one it used to miss. A link on our
    /// origin that answers with a redirect elsewhere looks internal by its request URL for
    /// the whole life of the download.
    func testRefusesAFileThatArrivedFromSomewhereElse() {
        XCTAssertFalse(DownloadPolicy.allowsWrite(
            requestURL: url("https://alpha.teameet.co.kr/files/report.pdf"),
            responseURL: url("https://attacker.example/report.pdf"),
            origin: origin))
    }

    func testAcceptsAFileThatStayedOnOurOrigin() {
        XCTAssertTrue(DownloadPolicy.allowsWrite(
            requestURL: url("https://alpha.teameet.co.kr/files/report.pdf"),
            responseURL: url("https://alpha.teameet.co.kr/files/generated/report.pdf"),
            origin: origin))
    }

    /// Still refused at the second gate even though only the first one should have caught
    /// it — the two checks are independent, not a chain that trusts the earlier link.
    func testRefusesADownloadThatWasNeverOurs() {
        XCTAssertFalse(DownloadPolicy.allowsWrite(
            requestURL: url("https://attacker.example/report.pdf"),
            responseURL: url("https://alpha.teameet.co.kr/report.pdf"),
            origin: origin))
    }

    /// Nothing to verify is not the same as nothing wrong.
    func testRefusesWhenTheResponseHasNoUrl() {
        XCTAssertFalse(DownloadPolicy.allowsWrite(
            requestURL: url("https://alpha.teameet.co.kr/files/report.pdf"),
            responseURL: nil,
            origin: origin))
    }

    func testRefusesALookAlikeHostInTheResponse() {
        for hostile in [
            "https://alpha.teameet.co.kr.attacker.example/report.pdf",
            "https://evilalpha.teameet.co.kr/report.pdf",
            "http://alpha.teameet.co.kr/report.pdf",
            "https://alpha.teameet.co.kr@attacker.example/report.pdf",
        ] {
            XCTAssertFalse(
                DownloadPolicy.allowsWrite(
                    requestURL: url("https://alpha.teameet.co.kr/files/report.pdf"),
                    responseURL: url(hostile),
                    origin: origin),
                "\(hostile) must not be written")
        }
    }

    /// A build whose origin was mangled must write nothing rather than fall back to
    /// matching on host alone.
    func testRefusesEverythingWhenTheConfiguredOriginIsBroken() {
        for broken in ["", "https:", "//alpha.teameet.co.kr"] {
            XCTAssertFalse(DownloadPolicy.allowsWrite(
                requestURL: url("https://alpha.teameet.co.kr/files/report.pdf"),
                responseURL: url("https://alpha.teameet.co.kr/files/report.pdf"),
                origin: broken))
        }
    }
}
