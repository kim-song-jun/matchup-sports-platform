import UIKit
import UserNotifications

/// Receives the OS callbacks SwiftUI has no equivalent for: the APNs device token, and the
/// notification delegate that decides what a tap does.
///
/// Counterpart of the push half of `MainActivity` plus `TeameetMessagingService` on Android.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {

    /// Set by the scene once the shell exists, so a tap has somewhere to navigate.
    weak var shell: WebShellViewController?
    private(set) var push: PushCoordinator?

    /// A notification tapped before the shell was ready. Cold-launching from a notification
    /// delivers the tap before any view controller exists, and dropping it would land the
    /// reader on the home screen instead of the thing they tapped.
    private var pendingRoute: String?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let coordinator = PushCoordinator(config: AppConfig.main)
        push = coordinator
        UNUserNotificationCenter.current().delegate = self

        // A registration the reader already consented to is renewed on every launch: APNs
        // can reissue a token at any time, and a stale one silently stops receiving.
        Task {
            // `||` takes autoclosures, which cannot be async, so the two states are read
            // separately rather than short-circuited.
            let subscribed = await coordinator.isSubscribed()
            let granted = await coordinator.currentPermission() == .granted
            if subscribed || granted { application.registerForRemoteNotifications() }
        }
        return true
    }

    /// Attaches the shell and replays a tap that arrived before it existed.
    func attach(shell: WebShellViewController) {
        self.shell = shell
        guard let route = pendingRoute else { return }
        pendingRoute = nil
        shell.load(route: route)
    }

    // MARK: - APNs registration

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { await push?.adopt(deviceToken: deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Expected on a build without an `aps-environment` entitlement, which is every
        // unsigned simulator build (NSCocoaErrorDomain 3000). The app keeps working and the
        // web's settings screen reports the device as not subscribed, which is the truth.
        push?.registrationFailed()
    }
}

// MARK: - Notification presentation and taps

extension AppDelegate: UNUserNotificationCenterDelegate {

    /// Whether to show a notification that arrives while the app is in front.
    ///
    /// Gated on the same consent pair Android uses. The OS permission alone is not enough:
    /// a reader who switched push off inside the app still has `authorized` status, and
    /// showing them a banner anyway would ignore the choice they made.
    ///
    /// Both delegate methods here take the completion handler rather than the `async`
    /// variant, and both finish on the main actor. The `async` form looks cleaner and
    /// crashes: it resumes on a cooperative background thread, UIKit calls its completion
    /// from there, and the state-restoration work that follows a notification tap asserts
    /// off the main thread — `Abort trap: 6` the moment a reader taps a banner. The
    /// requirement itself is not main-actor isolated, and neither `UNNotification` nor
    /// `UNNotificationResponse` is Sendable, so the payload is read out here and only the
    /// sanitised route crosses into the actor.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void
    ) {
        Task { @MainActor in
            let show = await shouldPresentIncomingNotification()
            completionHandler(show ? [.banner, .sound] : [])
        }
    }

    private func shouldPresentIncomingNotification() async -> Bool {
        guard let push else { return false }
        let granted = await push.currentPermission() == .granted
        let subscribed = await push.isSubscribed()
        return PushConsent.shouldDisplay(permissionGranted: granted, optedIn: subscribed || granted)
    }

    /// A tap. The last hop of the first vertical slice: an inquiry reply has to open that
    /// inquiry.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping @Sendable () -> Void
    ) {
        let route = PushNotificationPayload(
            userInfo: response.notification.request.content.userInfo).route
        Task { @MainActor in
            open(route: route)
            completionHandler()
        }
    }

    /// Opens a route in the shell, holding it if the shell does not exist yet.
    ///
    /// Reached from a notification tap and from a universal link. Both arrive before the
    /// scene is built on a cold launch, which is why the route is held rather than dropped.
    func open(route: String) {
        guard let shell else {
            // Cold launch: the shell is not built yet. Held rather than dropped, or the
            // reader lands on the home screen instead of what they tapped.
            pendingRoute = route
            return
        }
        shell.load(route: route)
    }
}
