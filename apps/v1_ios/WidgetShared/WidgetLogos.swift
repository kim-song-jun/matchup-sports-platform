import Foundation
import UIKit
import ImageIO
import CryptoKit

/// Shell and timeline provider download bounded logos; views read only local PNGs.
enum WidgetLogos {
    static func key(_ path: String) -> String { SHA256.hash(data: Data(path.utf8)).map { String(format: "%02x", $0) }.joined() + ".png" }
    static func url(_ path: String?, environment: WidgetEnvironment) -> URL? {
        guard let path, let url = URL(string: path, relativeTo: environment.origin)?.absoluteURL,
              url.scheme == "https", url.user == nil, url.password == nil else { return nil }
        return url
    }
    static func image(_ path: String?, store: WidgetStore?) -> UIImage? {
        guard let path, let store else { return nil }
        return UIImage(contentsOfFile: store.directory.appendingPathComponent("logos").appendingPathComponent(key(path)).path)
    }
    static func prefetch(model: WidgetModel, store: WidgetStore, revision: String, environment: WidgetEnvironment,
                         maxCount: Int = 20) async {
        let paths = WidgetLogoPolicy.paths(model: model, limit: maxCount) {
            image($0, store: store) != nil || url($0, environment: environment) == nil
        }
        guard !paths.isEmpty else { return }
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.timeoutIntervalForResource = 8
        config.timeoutIntervalForRequest = 8
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        await WidgetFetchBudget.run(timeout: WidgetLogoPolicy.timeout, cancel: { session.invalidateAndCancel() }) {
            for path in paths {
                guard !Task.isCancelled, (try? store.read().revision) == revision else { return }
                guard let source = url(path, environment: environment), image(path, store: store) == nil else { continue }
                do {
                    var request = URLRequest(url: source); request.timeoutInterval = 8
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                          http.url?.scheme == "https", response.expectedContentLength <= 524_288 else { continue }
                    var data = Data()
                    for try await byte in bytes {
                        guard !Task.isCancelled else { return }
                        data.append(byte)
                        if data.count > 524_288 { break }
                    }
                    guard data.count <= 524_288,
                          let source = CGImageSourceCreateWithData(data as CFData, nil),
                          let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                              kCGImageSourceThumbnailMaxPixelSize: 128, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary) else { continue }
                    let format = UIGraphicsImageRendererFormat(); format.scale = 1
                    let png = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: format).image { _ in
                        UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 128, height: 128)).addClip()
                        UIImage(cgImage: cg).draw(in: CGRect(x: 0, y: 0, width: 128, height: 128))
                    }.pngData()
                    guard !Task.isCancelled, let png else { continue }
                    _ = try store.update(revision: revision) { _ in
                        let dir = store.directory.appendingPathComponent("logos")
                        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                        try png.write(to: dir.appendingPathComponent(key(path)), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    }
                } catch {
                    // A missing logo renders the team's initial, never a remote image in the widget.
                    // Network/image failures do not alter the score, response or authentication state.
                    if Task.isCancelled { return }
                    continue
                }
            }
        }
    }
}
