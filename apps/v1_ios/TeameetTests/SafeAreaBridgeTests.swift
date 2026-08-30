import XCTest

/// The injected script is the only thing giving the v1 web app a bottom inset on iOS, so
/// its exact shape is worth pinning.
final class SafeAreaBridgeTests: XCTestCase {

    func testWritesBothVariablesThePageReads() {
        let script = SafeAreaBridge.script(bottomInsetPoints: 34)
        XCTAssertTrue(script.contains("'--teameet-native-safe-bottom','34px'"))
        // Android writes the shell variable directly too, so the shell stays correct against
        // a deployed web build whose CSS predates the max() definition.
        XCTAssertTrue(script.contains("'--v1-shell-safe-bottom','34px'"))
        XCTAssertTrue(script.contains("document.documentElement.style.setProperty"))
    }

    /// One CSS pixel is one point in a `WKWebView` at `initial-scale=1`, so the value is
    /// used as-is — no density division, unlike Android.
    func testRoundsToWholePixels() {
        XCTAssertTrue(SafeAreaBridge.script(bottomInsetPoints: 33.6).contains("'34px'"))
        XCTAssertTrue(SafeAreaBridge.script(bottomInsetPoints: 33.4).contains("'33px'"))
        XCTAssertTrue(SafeAreaBridge.script(bottomInsetPoints: 0).contains("'0px'"))
    }

    /// A device with no home indicator reports zero, and the page's own `max()` keeps that
    /// harmless. A negative value should never reach CSS.
    func testNeverEmitsANegativeInset() {
        XCTAssertTrue(SafeAreaBridge.script(bottomInsetPoints: -12).contains("'0px'"))
    }

    func testEmitsASingleStatementSafeToEvaluate() {
        let script = SafeAreaBridge.script(bottomInsetPoints: 34)
        XCTAssertFalse(script.contains("\n"), "the script must stay a single evaluable line")
        XCTAssertEqual(script.components(separatedBy: ";").count, 2)
    }

    func testReadbackAsksForBothVariables() {
        XCTAssertTrue(SafeAreaBridge.readbackScript.contains("--teameet-native-safe-bottom"))
        XCTAssertTrue(SafeAreaBridge.readbackScript.contains("--v1-shell-safe-bottom"))
        XCTAssertTrue(SafeAreaBridge.readbackScript.contains("getComputedStyle"))
    }
}
