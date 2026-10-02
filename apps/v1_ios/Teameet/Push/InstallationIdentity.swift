import Foundation
import Security

/// The identifier this installation registers under.
///
/// Counterpart of `InstallationIdentity` on Android, which keeps a UUID in
/// `SharedPreferences`. Here it lives in the keychain, and that difference is deliberate.
///
/// The API keys a device row on `(environment, installationId)`. If the identifier were
/// stored in `UserDefaults`, deleting the app would lose it and a reinstall would register a
/// second row — one nobody can ever revoke, still holding a token the server keeps trying to
/// deliver to. A keychain item survives deletion, so the same install reuses its row.
///
/// The cost is that "delete the app" no longer resets push. `revoke-push-device` from the
/// web settings screen is then the only user-facing reset, and `docs/ops/ios-apns-setup.md`
/// says so.
///
/// Accessibility is `AfterFirstUnlockThisDeviceOnly`: readable in the background once the
/// phone has been unlocked after boot, and never carried to another device by an iCloud
/// backup — restoring a backup onto a new phone must not resurrect the old device's row.
enum InstallationIdentity {

    static let service = "kr.co.teameet.installation"
    static let account = "installationId"

    /// Returns the stored identifier, creating one on first use.
    ///
    /// Returns `nil` only when the keychain is unavailable — which is real: an app launched
    /// in the background before the first unlock cannot read it. The caller treats that as
    /// "cannot register yet" and tries again later rather than inventing an identifier that
    /// would create a second row.
    static func current() -> UUID? {
        if let existing = read() { return existing }
        let created = UUID()
        switch store(created) {
        case .stored:
            return created
        case .alreadyPresent:
            // Something wrote between the read and the add. The stored value wins — this
            // device already has a row on the server under it, and replacing the identifier
            // would strand that row with a token nobody can revoke.
            return read()
        case .unavailable:
            return nil
        }
    }

    enum StoreOutcome {
        case stored
        case alreadyPresent
        case unavailable
    }

    static func read() -> UUID? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let text = String(data: data, encoding: .utf8) else { return nil }
        return UUID(uuidString: text)
    }

    /// Writes the identifier only if none is stored yet.
    ///
    /// Deliberately never overwrites. An existing identifier is the key to a device row the
    /// server already holds; replacing it would leave that row unreachable — still holding a
    /// token, with no installation id that could ever revoke it.
    @discardableResult
    static func store(_ identifier: UUID) -> StoreOutcome {
        guard let data = identifier.uuidString.data(using: .utf8) else { return .unavailable }
        var attributes = baseQuery()
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        switch SecItemAdd(attributes as CFDictionary, nil) {
        case errSecSuccess: return .stored
        case errSecDuplicateItem: return .alreadyPresent
        default: return .unavailable
        }
    }

    /// Removes the identifier. Used by tests and by a deliberate reset, not by revoke —
    /// revoking a device should stop delivery, not orphan the row it was revoking.
    @discardableResult
    static func clear() -> Bool {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
