import UIKit
import UserNotifications

/// Answers the four questions the web's notification settings screen can ask.
///
/// The permission and settings halves are complete here: asking the OS, reading the result
/// back, and opening the app's notification settings are all things the shell can do today.
/// Device registration is not — nothing registers with a push service yet — so
/// `isDeviceRegistered` is `false` and stays that way until the push lifecycle sets it.
/// That is an accurate answer rather than a placeholder: with no registration, the device is
/// genuinely not subscribed, and the web renders the off state correctly.
@MainActor
final class PushBridgeService {

    private let center: UNUserNotificationCenter

    /// Set by the push lifecycle once a device registration exists. Read by the bridge to
    /// fill the web's `subscribed` field.
    var isDeviceRegistered = false

    /// Called when the web asks to revoke this device. The push lifecycle installs the
    /// handler that deletes the token and tells the API; until then revoking is a no-op on a
    /// device that was never registered.
    var revokeRegistration: (() async -> Void)?

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func currentPermission() async -> PushPermission.WebValue {
        PushPermission.webValue(for: await center.notificationSettings().authorizationStatus)
    }

    /// Asks the OS for permission.
    ///
    /// Only meaningful once: after the reader has answered, iOS returns the standing answer
    /// without showing anything, which is why the web pairs this with a link into Settings
    /// for the denied case.
    func requestPermission() async -> PushPermission.WebValue {
        _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
        return await currentPermission()
    }

    /// Opens this app's page in Settings. The counterpart of Android's
    /// `ACTION_APP_NOTIFICATION_SETTINGS` branch.
    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString),
              UIApplication.shared.canOpenURL(url) else { return }
        UIApplication.shared.open(url)
    }

    func revoke() async {
        await revokeRegistration?()
        isDeviceRegistered = false
    }
}
