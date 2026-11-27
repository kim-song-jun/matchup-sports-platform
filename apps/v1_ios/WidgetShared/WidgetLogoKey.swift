import CryptoKit
import Foundation

/// Stable App Group filename, shared by the downloader and push content decoder.
enum WidgetLogoKey {
    static func make(_ path: String) -> String {
        SHA256.hash(data: Data(path.utf8)).map { String(format: "%02x", $0) }.joined() + ".png"
    }
}
