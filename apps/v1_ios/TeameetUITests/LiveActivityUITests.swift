import XCTest

/// Actual ActivityKit calls with clearly marked synthetic data; never logs in or mutates alpha.
@MainActor
final class LiveActivityUITests: XCTestCase {
    func testSystemSampleStartsUpdatesAndEnds() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--live-activity-preview", "live"]
        app.launch()
        defer {
            app.activate()
            let end = app.buttons["end-activity-sample"]
            if end.exists && end.isEnabled {
                if !end.isHittable { app.scrollViews.firstMatch.swipeUp() }
                end.tap()
            }
            app.terminate()
        }
        let start = app.buttons["start-activity-sample"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        if !start.isHittable { app.scrollViews.firstMatch.swipeUp() }
        start.tap()
        let outcome = app.staticTexts["activity-sample-outcome"]
        XCTAssertTrue(outcome.waitForExistence(timeout: 5))
        let started = NSPredicate(format: "label == %@", "시스템 카드 시작됨")
        expectation(for: started, evaluatedWith: outcome)
        waitForExpectations(timeout: 15)
        attach(app.screenshot(), name: "activity-system-sample-started")
        XCUIDevice.shared.press(.home)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        Thread.sleep(forTimeInterval: 1) // Let the home-transition animation finish before capturing the system island.
        attach(springboard.screenshot(), name: "activity-system-compact")
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)).press(forDuration: 1)
        Thread.sleep(forTimeInterval: 1)
        attach(springboard.screenshot(), name: "activity-system-expanded")
        app.activate()
        let update = app.buttons["update-activity-sample"]
        if !update.isHittable { app.scrollViews.firstMatch.swipeUp() }
        update.tap()
        expectation(for: NSPredicate(format: "label == %@", "시스템 카드 갱신됨"), evaluatedWith: outcome)
        waitForExpectations(timeout: 15)
        let final = app.buttons["final-activity-sample"]
        if !final.isHittable { app.scrollViews.firstMatch.swipeUp() }
        final.tap()
        expectation(for: NSPredicate(format: "label == %@", "시스템 카드 종료 화면 유지됨"), evaluatedWith: outcome)
        waitForExpectations(timeout: 15)
        let end = app.buttons["end-activity-sample"]
        if !end.isHittable { app.scrollViews.firstMatch.swipeUp() }
        end.tap()
        expectation(for: NSPredicate(format: "label == %@", "시스템 카드 종료됨"), evaluatedWith: outcome)
        waitForExpectations(timeout: 15)
    }
    private func attach(_ image: XCUIScreenshot, name: String) {
        let attachment = XCTAttachment(screenshot: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
