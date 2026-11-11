import Foundation

/// A `KakaoSignInTimer.Schedule` whose time only moves when a test moves it.
@MainActor
final class ManualClock {

    private var now: TimeInterval = 0
    private var nextID = 0
    private var timers: [Int: (due: TimeInterval, fire: @MainActor () -> Void)] = [:]

    var schedule: KakaoSignInTimer.Schedule {
        { [self] delay, fire in
            let id = nextID
            nextID += 1
            timers[id] = (now + delay, fire)
            return { [self] in timers[id] = nil }
        }
    }

    func advance(by seconds: TimeInterval) {
        now += seconds
        for id in timers.keys.sorted() {
            guard let timer = timers[id], timer.due <= now else { continue }
            timers[id] = nil
            timer.fire()
        }
    }
}
