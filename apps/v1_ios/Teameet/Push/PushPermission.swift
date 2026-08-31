import Foundation
import UserNotifications

/// Translates the OS notification permission into the three values the web understands.
///
/// `apps/v1_web/src/lib/native-push.ts` types the result as `NotificationPermission`, the
/// browser's own enum: `"default"`, `"denied"`, `"granted"`. The web renders its settings
/// screen from that string, so the mapping is a contract, not a detail — and it does not
/// change when real push registration lands, which is why it is pinned now.
enum PushPermission {

    /// The values `NotificationPermission` allows. Anything else would leave the web's
    /// switch statement without a branch.
    enum WebValue: String {
        case notDetermined = "default"
        case denied = "denied"
        case granted = "granted"
    }

    /// - Note: `provisional` and `ephemeral` map to `granted`. Both mean notifications will
    ///   actually be delivered — provisional ones arrive quietly in the notification centre —
    ///   so reporting them as anything else would show the reader a prompt for a permission
    ///   they already effectively have.
    static func webValue(for status: UNAuthorizationStatus) -> WebValue {
        switch status {
        case .notDetermined:
            return .notDetermined
        case .denied:
            return .denied
        case .authorized, .provisional, .ephemeral:
            return .granted
        @unknown default:
            // A status this build has never heard of is not evidence of consent.
            return .denied
        }
    }

    /// Whether the OS will deliver notifications at all. The counterpart of Android's
    /// `PushPermission.isGranted`.
    static func isGranted(_ status: UNAuthorizationStatus) -> Bool {
        webValue(for: status) == .granted
    }
}
