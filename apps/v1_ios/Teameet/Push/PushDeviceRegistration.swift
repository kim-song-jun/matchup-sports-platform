import Foundation

/// The registration this device sends to `POST /api/v1/notifications/push-devices`.
///
/// The API validates every field, and two of them are easy to get wrong in ways that fail
/// quietly rather than loudly:
///
/// - `installationId` must be a UUID. The controller runs it through `ParseUUIDPipe` on
///   revoke and the DTO declares `@IsUUID()`, so anything else is rejected.
/// - `platform` is required, not defaulted. A registration that omitted it would be refused
///   outright — which is the point: a default would have let an APNs token be stored as an
///   Android one, and Firebase accepting a token it can never deliver to looks exactly like
///   "notifications stopped working".
struct PushDeviceRegistration: Equatable {

    let installationId: UUID
    /// The APNs device token, lowercase hex. Apple hands it over as raw bytes.
    let token: String
    let appVersion: String?
    let deviceModel: String?
    /// Which APNs gateway issued `token`. The server cannot infer it: a TestFlight build of
    /// the alpha app is production-signed while one installed from Xcode is not, and both
    /// register against the same deployment.
    let apnsEnvironment: ApnsEnvironment

    static let platform = "ios"

    init(
        installationId: UUID,
        deviceToken: Data,
        appVersion: String?,
        deviceModel: String?,
        apnsEnvironment: ApnsEnvironment = .current
    ) {
        self.installationId = installationId
        self.token = Self.hexString(from: deviceToken)
        self.appVersion = appVersion?.isEmpty == true ? nil : appVersion
        self.deviceModel = deviceModel?.isEmpty == true ? nil : deviceModel
        self.apnsEnvironment = apnsEnvironment
    }

    /// Apple's token is `Data`; the API stores and compares it as a hex string.
    ///
    /// `Data.description` looks close enough to be tempting and is wrong — it yields
    /// `<20 bytes>` or a bracketed form depending on the OS version, which would register a
    /// token that can never receive anything.
    static func hexString(from token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }

    /// The JSON body the API expects. Built through `JSONSerialization` so a device model
    /// containing a quote cannot break the request.
    func jsonBody() -> Data? {
        var payload: [String: Any] = [
            "installationId": installationId.uuidString,
            "token": token,
            "platform": Self.platform,
            "apnsEnvironment": apnsEnvironment.rawValue,
        ]
        if let appVersion { payload["appVersion"] = appVersion }
        if let deviceModel { payload["deviceModel"] = deviceModel }
        return try? JSONSerialization.data(withJSONObject: payload)
    }

    /// Whether the token is plausible enough to send.
    ///
    /// The DTO requires at least 20 characters. An empty or stub token would be rejected by
    /// the API anyway; catching it here keeps a pointless authenticated request off the wire
    /// and keeps the retry loop from treating a client-side mistake as a server problem.
    var isSendable: Bool {
        token.count >= 20 && token.allSatisfy { $0.isHexDigit }
    }
}
