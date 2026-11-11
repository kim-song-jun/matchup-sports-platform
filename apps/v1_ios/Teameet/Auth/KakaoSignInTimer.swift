import Foundation

/// A one-shot timer that tests replace with a clock they move by hand.
enum KakaoSignInTimer {

    typealias Cancel = @MainActor () -> Void
    typealias Schedule = @MainActor (_ delay: TimeInterval, _ fire: @escaping @MainActor () -> Void) -> Cancel

    static let mainActor: Schedule = { delay, fire in
        let task = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            fire()
        }
        return { task.cancel() }
    }
}
