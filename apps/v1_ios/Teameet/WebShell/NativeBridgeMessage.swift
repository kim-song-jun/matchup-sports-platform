import Foundation

/// The contract `apps/v1_web/src/lib/native-push.ts` already speaks.
///
/// The web app is not modified for iOS. It calls
/// `window.TeameetNative.postMessage(JSON.stringify({ type, requestId }))` and waits for a
/// `teameet:native-push-result` CustomEvent carrying the same `requestId`. Everything here
/// exists to match that wire format exactly, so the same web build drives both shells.
///
/// Parsing and script building are kept free of WebKit so the malformed-input behaviour can
/// be pinned by tests — a page that sends nonsense must be ignored, never crash the shell
/// and never produce a reply that some other in-flight request might mistake for its own.
enum NativeBridge {

    /// The `WKScriptMessageHandler` name, and the global the shim installs. Both must stay
    /// `TeameetNative`: the web checks `window.TeameetNative?.postMessage`.
    static let handlerName = "TeameetNative"

    /// The event `requestNativePush` listens for.
    static let resultEventName = "teameet:native-push-result"

    /// The four actions the web can ask for. Anything else is ignored rather than answered,
    /// because answering an action we do not implement would resolve the page's promise with
    /// a state we did not actually check.
    enum Action: String, CaseIterable {
        case getPushState = "get-push-state"
        case requestNotificationPermission = "request-notification-permission"
        case openNotificationSettings = "open-notification-settings"
        case revokePushDevice = "revoke-push-device"
    }

    struct Message: Equatable {
        let action: Action
        /// Correlates the reply. The web generates a UUID per call and drops any event whose
        /// `requestId` does not match, so echoing it back verbatim is what makes concurrent
        /// calls safe.
        let requestId: String
    }

    /// Parses a message from the page.
    ///
    /// Returns `nil` for anything that is not a well-formed request for a known action. The
    /// web's own promise then times out, which is the correct outcome — better than a reply
    /// that claims a state nobody looked at.
    static func parse(_ raw: Any?) -> Message? {
        guard let text = raw as? String,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let payload = object as? [String: Any],
              let type = payload["type"] as? String,
              let action = Action(rawValue: type) else { return nil }
        // A missing requestId is answered with an empty one, matching Android's
        // `request.optString("requestId", "")`. The web ignores such an event, so the reply
        // is harmless, and the shell still performs the action the page asked for.
        let requestId = payload["requestId"] as? String ?? ""
        return Message(action: action, requestId: requestId)
    }

    /// Builds the JavaScript that hands a result back to the page.
    ///
    /// The detail object is serialised with `JSONSerialization` rather than string
    /// interpolation: `requestId` comes from the page, and pasting it into a script literal
    /// would let a quote in it rewrite the statement.
    static func resultScript(requestId: String, permission: String, subscribed: Bool) -> String {
        let detail: [String: Any] = [
            "requestId": requestId,
            "permission": permission,
            "subscribed": subscribed,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else {
            return ""
        }
        return "window.dispatchEvent(new CustomEvent('\(resultEventName)',{detail:\(json)}))"
    }

    /// Whether a frame that sent a message is allowed to drive the bridge.
    ///
    /// This is the iOS half of the `allowedOriginRules` argument Android passes to
    /// `addWebMessageListener`, where WebKit does the enforcing. Here nothing enforces it for
    /// us, so it has to be checked by hand — and it matters more than it looks: the message
    /// handler is installed on the content controller, so **every** frame can reach
    /// `window.webkit.messageHandlers.TeameetNative`, including the Kakao authorization page
    /// the shell deliberately loads in place. Without this check that page could ask the
    /// shell for the reader's notification state, or revoke their device.
    ///
    /// `port` follows `WKSecurityOrigin`'s convention of `0` for absent, which lines up with
    /// `AllowedNavigation`'s `nil`: an explicit `:443` is a different origin from none.
    static func matchesOrigin(
        scheme: String, host: String, port: Int, expectedOrigin: String
    ) -> Bool {
        // The configured origin is checked as strictly as the sender's. A build whose
        // TEAMEET_WEB_ORIGIN was mangled — the xcconfig parser truncates a literal `//`, so
        // `https://host` can arrive as `https:` or `//host` — must end up trusting nothing
        // rather than accidentally matching on host alone.
        guard let expected = AllowedNavigation.parse(expectedOrigin),
              let expectedScheme = expected.scheme,
              expectedScheme.caseInsensitiveCompare("https") == .orderedSame,
              let expectedHost = expected.host,
              expected.userInfo == nil else { return false }
        guard scheme.caseInsensitiveCompare("https") == .orderedSame else { return false }
        guard host.caseInsensitiveCompare(expectedHost) == .orderedSame else { return false }
        return port == (expected.port ?? 0)
    }

    /// Installed at document start so the page finds the global before any of its own script
    /// runs — `isNativePushAvailable()` is called during render.
    ///
    /// The object is frozen and the property non-writable so page code cannot replace the
    /// bridge with one of its own and have the shell answer it.
    static let shimScript = """
    (function () {
      var handlers = window.webkit && window.webkit.messageHandlers;
      if (!handlers || !handlers.\(handlerName)) { return; }
      if (window.\(handlerName)) { return; }
      Object.defineProperty(window, '\(handlerName)', {
        value: Object.freeze({
          postMessage: function (message) {
            handlers.\(handlerName).postMessage(String(message));
          }
        }),
        writable: false,
        configurable: false,
        enumerable: true
      });
    })();
    """
}
