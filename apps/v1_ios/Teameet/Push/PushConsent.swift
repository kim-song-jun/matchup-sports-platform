import Foundation

/// Whether the app may register for, and display, push notifications.
///
/// Direct port of `PushDeliveryPolicy`
/// (`apps/v1_android/app/src/main/java/kr/co/teameet/PushDeliveryPolicy.java`), including
/// its four-combination truth table.
///
/// Two conditions, not one. The OS permission says notifications *can* be delivered; the
/// in-app opt-in says the user *asked* for them. Android added the second because granting
/// the system permission once should not silently re-enable push after the user turned it
/// off inside the app, and iOS has exactly the same gap — a reader who switches push off in
/// settings still has `UNAuthorizationStatus.authorized`.
enum PushConsent {

    /// Whether an arriving notification should be shown while the app is in the foreground.
    static func shouldDisplay(permissionGranted: Bool, optedIn: Bool) -> Bool {
        hasActiveConsent(permissionGranted: permissionGranted, optedIn: optedIn)
    }

    /// Whether the app may hold a registration with the push service at all.
    static func hasActiveConsent(permissionGranted: Bool, optedIn: Bool) -> Bool {
        permissionGranted && optedIn
    }
}
