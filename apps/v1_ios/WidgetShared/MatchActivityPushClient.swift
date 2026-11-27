import Foundation

/// Registration is for an existing card only. Push-to-start will need a separate kind and
/// permission/lifecycle contract; never silently treat one token as the other.
enum MatchActivityPushTokenKind: String, Sendable { case activity }

struct MatchActivityPushClient: Sendable {
    let api: WidgetAPI
    init(api: WidgetAPI = WidgetAPI()) { self.api = api }

    private struct Payload: Encodable { let gameId: String; let pushToken: String }
    static func body(gameID: String, pushToken: Data) throws -> Data {
        guard !gameID.isEmpty, !pushToken.isEmpty, pushToken.count <= 2048 else { throw WidgetFailure.invalidResponse }
        return try JSONEncoder().encode(Payload(gameId: gameID,
            pushToken: pushToken.map { String(format: "%02x", $0) }.joined()))
    }
    func register(gameID: String, pushToken: Data, widgetToken: String) async throws {
        _ = try await api.send(path: "widget/live-activity-token", method: "PUT", token: widgetToken,
                              body: Self.body(gameID: gameID, pushToken: pushToken))
    }
    func revoke(gameID: String, pushToken: Data, widgetToken: String) async throws {
        _ = try await api.send(path: "widget/live-activity-token", method: "DELETE", token: widgetToken,
                              body: Self.body(gameID: gameID, pushToken: pushToken))
    }
}
