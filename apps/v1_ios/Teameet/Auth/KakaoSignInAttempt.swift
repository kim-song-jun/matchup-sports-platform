import Foundation

/// The outcome of one SDK step, settled exactly once.
///
/// Either the SDK callback or our own cancellation can settle a step, in any order and on any
/// thread. Resuming a `CheckedContinuation` twice crashes, so the first result wins and a later
/// one is dropped.
final class KakaoSignInStep<Value: Sendable>: @unchecked Sendable {

    // Guards `outcome` and `waiter`; the continuation itself is resumed outside the lock.
    private let lock = NSLock()
    private var outcome: Result<Value, Error>?
    private var waiter: CheckedContinuation<Value, Error>?

    /// Returns whether `result` is the one that settled the step.
    @discardableResult
    func deliver(_ result: Result<Value, Error>) -> Bool {
        let (won, waiting) = lock.withLock { () -> (Bool, CheckedContinuation<Value, Error>?) in
            guard outcome == nil else { return (false, nil) }
            outcome = result
            let waiting = waiter
            waiter = nil
            return (true, waiting)
        }
        waiting?.resume(with: result)
        return won
    }

    /// Returns the settled result, waiting for it if it has not arrived yet.
    func wait() async throws -> Value {
        try await withCheckedThrowingContinuation { continuation in
            let settled = lock.withLock { () -> Result<Value, Error>? in
                if outcome == nil { waiter = continuation }
                return outcome
            }
            if let settled { continuation.resume(with: settled) }
        }
    }
}

/// Runs one operation at a time, newest first: starting another cancels the one still pending.
///
/// The Kakao SDK keeps a single KakaoTalk callback, so a second request cannot share it with a
/// first that never finished. The replaced operation is cancelled and the new one starts.
@MainActor
final class KakaoSignInLatest<Value: Sendable> {

    private var pending: Task<Value, Error>?

    func run(_ operation: @escaping @MainActor () async throws -> Value) async throws -> Value {
        pending?.cancel()
        let task = Task { try await operation() }
        pending = task
        // Only the operation that is still the newest clears the slot; a replaced one finishing
        // late must not forget the one that replaced it.
        defer { if pending == task { pending = nil } }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }
}
