import UIKit
import UserNotifications

/// Owns the push lifecycle: permission, the APNs device token, and the server registration.
///
/// Counterpart of the three-way dance `MainActivity` does on Android, minus the Firebase
/// leg — the token comes straight from APNs.
///
/// The order is fixed and each step gates the next. Asking for a token before permission
/// yields one the user never agreed to; registering before a session cookie exists gets a
/// 401. So the coordinator holds the pieces as they arrive and completes the registration on
/// whichever event supplies the last one, which is why `register()` is safe to call from
/// both the token callback and every authenticated page load.
@MainActor
final class PushCoordinator {

    private let config: AppConfig
    private let client: PushDeviceClient
    private let center: UNUserNotificationCenter

    /// The most recent APNs token. Deliberately not persisted: Apple reissues it on demand,
    /// and a stored copy could only ever be staler than what the system hands us.
    private var deviceToken: Data?
    private(set) var isRegistered = false
    /// The user's own choice, separate from the OS permission. Android keeps the same flag,
    /// because granting the system permission again must not silently re-enable push the
    /// reader turned off in the app.
    private var optedIn: Bool

    private let optedInKey = "kr.co.teameet.push.optedIn"
    private let defaults: UserDefaults

    init(
        config: AppConfig,
        client: PushDeviceClient? = nil,
        center: UNUserNotificationCenter = .current(),
        defaults: UserDefaults = .standard
    ) {
        self.config = config
        self.client = client ?? PushDeviceClient(config: config)
        self.center = center
        self.defaults = defaults
        self.optedIn = defaults.bool(forKey: optedInKey)
    }

    // MARK: - State the web asks for

    func currentPermission() async -> PushPermission.WebValue {
        PushPermission.webValue(for: await center.notificationSettings().authorizationStatus)
    }

    /// What the bridge reports as `subscribed`.
    ///
    /// All three have to hold: the OS will deliver, the reader asked for it, and the server
    /// actually has a row. Reporting `true` on permission alone would show an enabled switch
    /// for a device that receives nothing.
    func isSubscribed() async -> Bool {
        guard PushConsent.hasActiveConsent(
            permissionGranted: await currentPermission() == .granted,
            optedIn: optedIn
        ) else { return false }
        return isRegistered
    }

    // MARK: - Lifecycle

    /// The web's `request-notification-permission`.
    func requestPermission() async -> PushPermission.WebValue {
        setOptedIn(true)
        _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
        let permission = await currentPermission()
        guard permission == .granted else {
            // Denied. Nothing to register, and the opt-in stays recorded so that turning the
            // OS permission on later does not by itself start delivery.
            return permission
        }
        UIApplication.shared.registerForRemoteNotifications()
        await register()
        return permission
    }

    /// The web's `revoke-push-device`.
    func revoke() async {
        setOptedIn(false)
        isRegistered = false
        UIApplication.shared.unregisterForRemoteNotifications()
        deviceToken = nil
        guard let installationId = InstallationIdentity.current() else { return }
        _ = await client.revoke(installationId: installationId)
    }

    /// Called from `didRegisterForRemoteNotificationsWithDeviceToken`.
    func adopt(deviceToken token: Data) async {
        deviceToken = token
        await register()
    }

    /// Called from `didFailToRegisterForRemoteNotificationsWithError`.
    ///
    /// The common cause on a simulator build is a missing `aps-environment` entitlement
    /// (`NSCocoaErrorDomain` 3000). The app keeps working; the bridge simply reports the
    /// device as not subscribed, which is the truth.
    func registrationFailed() {
        deviceToken = nil
        isRegistered = false
    }

    /// Completes the registration if every piece is present. Safe to call repeatedly — it
    /// is invoked from the token callback and from every authenticated page load, mirroring
    /// Android's `onPageFinished`.
    @discardableResult
    func register() async -> Bool {
        guard optedIn,
              await currentPermission() == .granted,
              let token = deviceToken,
              let installationId = InstallationIdentity.current() else { return false }

        let registration = PushDeviceRegistration(
            installationId: installationId,
            deviceToken: token,
            appVersion: config.appVersion,
            deviceModel: UIDevice.current.model)

        let outcome = await client.register(registration)
        isRegistered = outcome == .registered
        return isRegistered
    }

    /// Called when the app returns to the foreground. If the reader turned the OS permission
    /// off in Settings, the local state has to follow — Android does the same in `onResume`.
    func reconcileWithSystemPermission() async {
        guard await currentPermission() != .granted else { return }
        guard optedIn || isRegistered else { return }
        await revoke()
    }

    private func setOptedIn(_ value: Bool) {
        optedIn = value
        defaults.set(value, forKey: optedInKey)
    }
}
