import Foundation

/// Why the page asked for the device registration to be dropped.
///
/// The bridge action is the same in both cases — the web sends `revoke-push-device` from the
/// settings switch and from the logout button — but they must not have the same effect on
/// this device. Turning the switch off is the reader's choice about push, so the in-app
/// opt-in follows it. Signing out is not: the server row has to go so the next account on
/// this phone does not receive the previous one's notifications, but the reader still wants
/// push, and the registration is re-created for whoever signs in next.
///
/// Measured: with both treated as an opt-out, a reader who signed out and back in received
/// nothing until they found 마이 → 알림 설정 and turned the switch on again — the explainer
/// had already been spent, so nothing ever asked.
enum PushRevocation: Equatable {
    /// The settings switch, or the OS permission having been withdrawn.
    case userTurnedOff
    /// The logout button. The web marks it with `reason: "sign-out"` on the bridge message.
    case signedOut

    static let signOutReason = "sign-out"

    /// A message without a reason is an opt-out — that is what every older web build sends.
    init(bridgeReason: String?) {
        self = bridgeReason == Self.signOutReason ? .signedOut : .userTurnedOff
    }

    /// Whether the reader's in-app opt-in and the APNs token survive the revocation.
    var keepsOptIn: Bool { self == .signedOut }
}
