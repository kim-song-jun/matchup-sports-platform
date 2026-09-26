import Foundation
import Network

/// Reports the moment the device regains a usable network path.
///
/// The shell uses this for one narrow purpose: while the error screen is up because the
/// device could not reach the network, reconnecting should bring the app back without the
/// user tapping anything.
///
/// It fires only on the transition into a satisfied path, never repeatedly while connected.
/// That restraint is deliberate — a server returning 500 keeps returning 500 after Wi-Fi
/// reconnects, so retrying on every update would add load during an outage while fixing
/// nothing. Failures that are not connectivity failures keep the manual button and nothing
/// else.
@MainActor
final class NetworkReachability {

    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "kr.co.teameet.reachability")
    private var isStarted = false

    /// Starts as `true` so a launch that already has connectivity does not count as a
    /// restoration and trigger a spurious reload.
    private var isSatisfied = true

    /// Called on the main actor when the path becomes satisfied after having been lost.
    var onPathRestored: (() -> Void)?

    init(monitor: NWPathMonitor = NWPathMonitor()) {
        self.monitor = monitor
    }

    func start() {
        guard !isStarted else { return }
        isStarted = true
        monitor.pathUpdateHandler = { [weak self] path in
            // Only the verdict crosses the actor boundary, not the path object.
            let satisfied = path.status == .satisfied
            Task { @MainActor [weak self] in
                self?.handle(satisfied: satisfied)
            }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        guard isStarted else { return }
        isStarted = false
        monitor.cancel()
    }

    private func handle(satisfied: Bool) {
        let wasSatisfied = isSatisfied
        isSatisfied = satisfied
        guard NetworkPathTransition.isRestoration(wasSatisfied: wasSatisfied, isSatisfied: satisfied)
        else { return }
        onPathRestored?()
    }
}
