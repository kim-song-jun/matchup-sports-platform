import JavaScriptCore
import XCTest

/// The rewrite runs inside the page, so it is exercised here the same way — under a real
/// JavaScript engine, not by reading the source string.
final class ViewportLockTests: XCTestCase {

    private func locked(_ content: String?) throws -> String {
        let context = try XCTUnwrap(JSContext())
        context.evaluateScript(ViewportLock.rewriteFunction)
        let function = try XCTUnwrap(context.objectForKeyedSubscript("lockedViewportContent"))
        let argument: Any = content ?? NSNull()
        let result = try XCTUnwrap(function.call(withArguments: [argument]))
        XCTAssertNil(context.exception, "the rewrite threw: \(String(describing: context.exception))")
        return result.toString()
    }

    private let expected = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"

    /// The value Next.js renders today. Nothing but the scale lock is added.
    func testLocksTheScaleAndKeepsWhatThePageDeclared() throws {
        XCTAssertEqual(try locked("width=device-width, initial-scale=1"), expected)
    }

    /// A page that permits zoom is overruled, not merely appended to — two competing
    /// `maximum-scale` entries would leave the answer to WebKit's parser.
    func testReplacesAScaleLimitThePageAlreadyDeclares() throws {
        XCTAssertEqual(
            try locked("width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes"),
            expected)
        XCTAssertEqual(try locked("user-scalable=yes, width=device-width, initial-scale=1"), expected)
    }

    /// The observer re-runs the rewrite on every change to the tag, including its own write.
    func testIsIdempotent() throws {
        XCTAssertEqual(try locked(expected), expected)
    }

    /// No viewport at all gets the mobile default plus the lock, never the lock alone.
    func testSuppliesTheMobileDefaultWhenThePageDeclaresNone() throws {
        XCTAssertEqual(try locked(""), expected)
        XCTAssertEqual(try locked(nil), expected)
    }

    /// `SafeAreaBridge` owns the bottom inset precisely because the page has no
    /// `viewport-fit=cover`. The lock must not introduce one.
    func testNeverIntroducesViewportFitCover() throws {
        XCTAssertFalse(try locked("width=device-width, initial-scale=1").contains("viewport-fit"))
        XCTAssertFalse(ViewportLock.script.contains("viewport-fit"))
    }

    /// The injected script has to carry the rewrite and keep applying it after React renders
    /// the tag again on a client-side navigation.
    func testScriptAppliesTheRewriteAndWatchesForReactRewrites() {
        XCTAssertTrue(ViewportLock.script.contains(ViewportLock.rewriteFunction))
        XCTAssertTrue(ViewportLock.script.contains("meta[name=\"viewport\"]"))
        XCTAssertTrue(ViewportLock.script.contains("MutationObserver"))
    }
}
