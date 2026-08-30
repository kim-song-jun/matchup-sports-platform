import XCTest

/// Round-trips the persisted session through a real `UserDefaults`, including the paths
/// that must fall back to `/home` rather than hand WebKit a payload it may not understand.
final class WebShellSessionStoreTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUpWithError() throws {
        suiteName = "kr.co.teameet.tests.\(UUID().uuidString)"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    private func store(build: String = "42", os: Int = 18) -> WebShellSessionStore {
        WebShellSessionStore(defaults: defaults, appBuild: build, osMajorVersion: os)
    }

    func testReturnsNothingBeforeAnythingIsSaved() {
        XCTAssertNil(store().load())
    }

    func testRoundTripsWithinTheSameBuild() {
        let state = Data("interaction-state".utf8)
        store().save(state)
        XCTAssertEqual(store().load(), state)
    }

    /// The whole reason the envelope exists: after an app update the payload is dropped and
    /// the shell starts at /home instead of replaying bytes from a different build.
    func testDropsStateAfterAnAppUpdate() {
        store(build: "41").save(Data("old".utf8))
        XCTAssertNil(store(build: "42").load())
    }

    func testDropsStateAfterAnOsMajorUpgrade() {
        store(os: 17).save(Data("old".utf8))
        XCTAssertNil(store(os: 18).load())
    }

    /// Whatever else is in the defaults key, loading must return nil rather than trap.
    func testDropsCorruptStoredValue() {
        defaults.set(Data("not a plist".utf8), forKey: WebShellSessionStore.defaultsKey)
        XCTAssertNil(store().load())

        defaults.set("a string, not data", forKey: WebShellSessionStore.defaultsKey)
        XCTAssertNil(store().load())
    }

    /// A web view with no interaction state yet must clear the slot rather than leave a
    /// stale page to be restored on the next launch.
    func testSavingNothingClearsPreviousState() {
        store().save(Data("something".utf8))
        XCTAssertNotNil(store().load())

        store().save(nil)
        XCTAssertNil(store().load())

        store().save(Data("something".utf8))
        store().save(Data())
        XCTAssertNil(store().load())
    }

    func testClearRemovesStoredState() {
        store().save(Data("something".utf8))
        store().clear()
        XCTAssertNil(store().load())
        XCTAssertNil(defaults.data(forKey: WebShellSessionStore.defaultsKey))
    }
}
