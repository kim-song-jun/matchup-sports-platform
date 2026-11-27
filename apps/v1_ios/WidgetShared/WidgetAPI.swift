import Foundation

enum WidgetFailure: Error, LocalizedError, Equatable {
    case signedOut, changedSession, invalidResponse, http(Int), transport
    var errorDescription: String? {
        switch self {
        case .signedOut: "팀밋에 로그인해 주세요"
        case .changedSession: "로그인 정보가 바뀌었어요. 앱에서 확인해 주세요"
        case .invalidResponse: "위젯 응답을 읽지 못했어요"
        case .http(let code): "요청을 처리하지 못했어요 (\(code)). 앱에서 다시 확인해 주세요"
        case .transport: "연결하지 못했어요. 잠시 후 다시 시도해 주세요"
        }
    }
}
struct WidgetEnvironment: Sendable {
    let origin: URL
    let group: String
    static var current: Self {
        let alpha = Bundle.main.object(forInfoDictionaryKey: "TeameetChannel") as? String == "alpha"
        return Self(origin: URL(string: alpha ? "https://alpha.teameet.co.kr" : "https://teameet.co.kr")!,
                    group: alpha ? "group.kr.co.teameet.alpha" : "group.kr.co.teameet")
    }
    func url(_ path: String) -> URL { origin.appendingPathComponent("api/v1/" + path) }
}
struct WidgetAPI: Sendable {
    let environment: WidgetEnvironment
    let session: URLSession
    init(environment: WidgetEnvironment = .current, session: URLSession? = nil) {
        self.environment = environment
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil; c.httpShouldSetCookies = false; c.urlCache = nil
        self.session = session ?? URLSession(configuration: c, delegate: WidgetRedirectPolicy(), delegateQueue: nil)
    }
    func send(path: String, method: String = "GET", token: String? = nil, cookie: String? = nil, body: Data? = nil) async throws -> Data {
        var r = URLRequest(url: environment.url(path))
        r.httpMethod = method; r.timeoutInterval = 15; r.httpBody = body
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let cookie { r.setValue(cookie, forHTTPHeaderField: "Cookie"); r.setValue(environment.origin.absoluteString, forHTTPHeaderField: "Origin") }
        if body != nil { r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let data: Data, response: URLResponse
        do { (data, response) = try await session.data(for: r) } catch { throw WidgetFailure.transport }
        guard let http = response as? HTTPURLResponse else { throw WidgetFailure.invalidResponse }
        if http.statusCode == 401 { throw WidgetFailure.signedOut }
        guard (200...299).contains(http.statusCode) else { throw WidgetFailure.http(http.statusCode) }
        return data
    }
    func mint(cookie: String) async throws -> String {
        let data = try await send(path: "me/widget-token", method: "POST", cookie: cookie)
        struct Payload: Decodable { let data: Token; struct Token: Decodable { let token: String } }
        guard let token = try? JSONDecoder().decode(Payload.self, from: data).data.token, !token.isEmpty else { throw WidgetFailure.invalidResponse }
        return token
    }
    func home(token: String) async throws -> WidgetModel { try WidgetModel.parse(await send(path: "widget/home", token: token)) }
    func revoke(token: String) async throws { _ = try await send(path: "widget/token", method: "DELETE", token: token) }
    func attendance(id: String, going: Bool, token: String) async throws {
        guard !id.isEmpty, id.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }) else { throw WidgetFailure.invalidResponse }
        let body = try JSONEncoder().encode(["status": going ? "GOING" : "NOT_GOING"])
        _ = try await send(path: "widget/schedules/\(id)/attendance", method: "PUT", token: token, body: body)
    }
}
/// Never forward credentials to a redirected request, even on another HTTPS host.
private final class WidgetRedirectPolicy: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
