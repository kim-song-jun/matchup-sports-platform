import XCTest

/// A late SDK callback after the attempt was resolved, and a new request meeting an attempt
/// that never finished: neither may crash the app or wedge later sign-ins.
@MainActor
final class KakaoSignInAttemptTests: XCTestCase {

    private struct Cancelled: Error {}
    private struct SdkFailure: Error {}

    /// A step the way the controller waits on one: cancellation settles it as `Cancelled`.
    private func waitFor(_ step: KakaoSignInStep<String>) async throws -> String {
        try await withTaskCancellationHandler {
            try await step.wait()
        } onCancel: {
            step.deliver(.failure(Cancelled()))
        }
    }

    /// Lets queued main-actor work run; the assertions below hold however it interleaves.
    private func settle() async {
        for _ in 0..<20 { await Task.yield() }
    }

    // MARK: - KakaoSignInStep

    func testOnlyTheFirstResultIsKept() async throws {
        let step = KakaoSignInStep<String>()

        XCTAssertTrue(step.deliver(.success("first")))
        XCTAssertFalse(step.deliver(.success("second")))
        XCTAssertFalse(step.deliver(.failure(SdkFailure())))

        let value = try await step.wait()
        XCTAssertEqual(value, "first")
    }

    func testAWaiterIsResumedByAResultThatArrivesLater() async throws {
        let step = KakaoSignInStep<String>()
        let waiter = Task { try await step.wait() }
        await settle()

        step.deliver(.success("token"))

        let value = try await waiter.value
        XCTAssertEqual(value, "token")
    }

    /// The SDK's own callback can fire after the reader already left; it must be a no-op, not
    /// a second resume of a continuation that was already resumed.
    func testALateSdkCallbackAfterCancellationIsDropped() async {
        let step = KakaoSignInStep<String>()
        let attempt = Task { try await self.waitFor(step) }
        await settle()

        attempt.cancel()
        let outcome = await attempt.result

        guard case .failure(let error) = outcome, error is Cancelled else {
            return XCTFail("expected the cancellation to settle the step, got \(outcome)")
        }
        XCTAssertFalse(step.deliver(.success("late token")))
    }

    func testCancellingBeforeTheStepStartsStillSettlesIt() async {
        let step = KakaoSignInStep<String>()
        let attempt = Task { () async throws -> String in
            await Task.yield()
            return try await self.waitFor(step)
        }
        attempt.cancel()

        let outcome = await attempt.result

        guard case .failure(let error) = outcome, error is Cancelled else {
            return XCTFail("a pre-cancelled attempt must not wait forever, got \(outcome)")
        }
    }

    /// The SDK and our timer can answer on different threads at the same moment.
    func testRacingResultsSettleTheStepExactlyOnce() async throws {
        for _ in 0..<200 {
            let step = KakaoSignInStep<Int>()
            let waiter = Task { try await step.wait() }
            let wins = Counter()

            DispatchQueue.concurrentPerform(iterations: 8) { index in
                if step.deliver(.success(index)) { wins.increment() }
            }

            XCTAssertEqual(wins.value, 1)
            let value = try await waiter.value
            XCTAssertTrue((0..<8).contains(value))
        }
    }

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        var value: Int { lock.withLock { count } }
        func increment() { lock.withLock { count += 1 } }
    }

    // MARK: - KakaoSignInLatest

    func testANewRequestCancelsThePendingOneAndRunsInstead() async throws {
        let latest = KakaoSignInLatest<String>()
        let stale = KakaoSignInStep<String>()
        let fresh = KakaoSignInStep<String>()
        let first = Task { try await latest.run { try await self.waitFor(stale) } }
        await settle()

        let second = Task { try await latest.run { try await self.waitFor(fresh) } }
        await settle()
        fresh.deliver(.success("fresh"))

        let value = try await second.value
        XCTAssertEqual(value, "fresh")
        do {
            _ = try await first.value
            XCTFail("the replaced request must not complete")
        } catch is Cancelled {
        }
        XCTAssertFalse(stale.deliver(.success("late")), "a late callback for the replaced request is ignored")
    }

    /// The replaced request finishes after its replacement started. Forgetting the replacement
    /// then would leave the next request nothing to cancel.
    func testAReplacedRequestFinishingLateDoesNotUnseatItsReplacement() async throws {
        let latest = KakaoSignInLatest<String>()
        let steps = (0..<3).map { _ in KakaoSignInStep<String>() }
        let first = Task { try await latest.run { try await self.waitFor(steps[0]) } }
        await settle()
        let second = Task { try await latest.run { try await self.waitFor(steps[1]) } }
        await settle()
        _ = await first.result

        let third = Task { try await latest.run { try await self.waitFor(steps[2]) } }
        await settle()
        steps[2].deliver(.success("third"))

        let value = try await third.value
        XCTAssertEqual(value, "third")
        let outcome = await second.result
        guard case .failure(let error) = outcome, error is Cancelled else {
            return XCTFail("the second request should have been replaced by the third, got \(outcome)")
        }
    }

    func testRequestsOneAfterAnotherAreNotCancelled() async throws {
        let latest = KakaoSignInLatest<String>()

        let first = try await latest.run { "one" }
        let second = try await latest.run { "two" }

        XCTAssertEqual([first, second], ["one", "two"])
    }

    func testCancellingTheCallerCancelsThePendingRequest() async {
        let latest = KakaoSignInLatest<String>()
        let step = KakaoSignInStep<String>()
        let caller = Task { try await latest.run { try await self.waitFor(step) } }
        await settle()

        caller.cancel()
        let outcome = await caller.result

        guard case .failure(let error) = outcome, error is Cancelled else {
            return XCTFail("expected the request to be cancelled, got \(outcome)")
        }
    }
}
