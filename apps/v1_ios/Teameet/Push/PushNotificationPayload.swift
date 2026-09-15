import Foundation

/// What the shell reads out of a notification.
///
/// The server sends the same two custom keys to both platforms — `route` and
/// `notificationId` — alongside the standard `aps` dictionary. Android reads them from
/// `RemoteMessage.getData()`; on iOS they arrive as top-level entries in the `userInfo`
/// dictionary the delegate hands over.
///
/// This is the last hop of the first vertical slice: a reply to an inquiry has to open that
/// inquiry, not the notification list. Getting it wrong is invisible in a build log and
/// shows up only as a tap that lands on the wrong screen, so the extraction is a pure
/// function with the payload shapes pinned by tests.
struct PushNotificationPayload: Equatable, Sendable {

    enum Key {
        static let route = "route"
        static let notificationId = "notificationId"
        static let aps = "aps"
    }

    /// Always a safe relative route: whatever arrived has already been through
    /// `DeepLinkRoute.safeRoute`, so a payload that tried to steer the shell off-origin
    /// lands on the notification list instead.
    let route: String
    /// Used to collapse duplicates. Absent on a payload that predates the field.
    let notificationId: String?

    /// Reads a notification's user info.
    ///
    /// A missing or unusable `route` is not a failure — the notification is still worth
    /// opening, just at the list. That matches Android, where `safeRoute(null)` returns the
    /// same fallback rather than dropping the tap.
    init(userInfo: [AnyHashable: Any]) {
        route = DeepLinkRoute.safeRoute(userInfo[Key.route] as? String)
        let id = userInfo[Key.notificationId] as? String
        notificationId = (id?.isEmpty ?? true) ? nil : id
    }

    /// Whether this looks like a notification from our own service rather than something
    /// else that reached the delegate.
    static func isTeameetNotification(_ userInfo: [AnyHashable: Any]) -> Bool {
        userInfo[Key.aps] != nil
    }
}
