import UIKit
import WebKit

/// Handles file downloads started from inside the web app.
///
/// Mirrors `MainActivity.enqueueInternalDownload`: only the exact environment origin may
/// hand the app a file, and the session cookie only ever travels to that origin. On iOS the
/// cookie part is automatic — `WKDownload` inherits the web view's data store — so what is
/// left is the origin check and somewhere to put the file.
///
/// The file lands in a temporary directory and is offered through the share sheet rather
/// than written into the user's documents. Android hands the download to `DownloadManager`,
/// which owns notification, storage and cleanup; iOS has no equivalent, and the share sheet
/// is the one path that lets the user choose Files, Photos or another app without the shell
/// claiming storage it would then have to manage.
@MainActor
final class DownloadHandler: NSObject {

    private let origin: String
    private weak var presenter: UIViewController?
    private var destinations: [ObjectIdentifier: URL] = [:]

    /// Shown when a download is refused or fails. Same two messages Android shows.
    var onMessage: ((String) -> Void)?

    init(origin: String, presenter: UIViewController) {
        self.origin = origin
        self.presenter = presenter
    }

    /// Whether a download may proceed. A file offered by anything other than the exact
    /// environment origin is refused outright.
    func accepts(_ download: WKDownload) -> Bool {
        AllowedNavigation.isInternal(download.originalRequest?.url, origin: origin)
    }

    func attach(_ download: WKDownload) {
        guard accepts(download) else {
            download.cancel()
            onMessage?(Strings.downloadRefused)
            return
        }
        download.delegate = self
    }
}

extension DownloadHandler: WKDownloadDelegate {

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String
    ) async -> URL? {
        // Re-checked at the point the file is about to be written, because a redirect can
        // move a download off the origin between the request and the response.
        guard accepts(download) else {
            onMessage?(Strings.downloadRefused)
            return nil
        }

        // A fresh directory per download so two files with the same suggested name cannot
        // overwrite each other.
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("downloads", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true)
        } catch {
            onMessage?(Strings.downloadFailed)
            return nil
        }

        let name = suggestedFilename.isEmpty ? "teameet-download" : suggestedFilename
        let destination = directory.appendingPathComponent(name)
        destinations[ObjectIdentifier(download)] = destination
        return destination
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let destination = destinations.removeValue(forKey: ObjectIdentifier(download)) else {
            return
        }
        present(destination)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
        // A download the user dismissed is not a failure worth reporting.
        guard WebShellFailurePolicy.shouldPresentFailure(for: error) else { return }
        onMessage?(Strings.downloadFailed)
    }

    private func present(_ fileURL: URL) {
        guard let presenter, presenter.view.window != nil else { return }
        let share = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        // iPad has no default anchor for a popover; the shell is iPhone-only, but an
        // unanchored popover would trap the app rather than fail visibly.
        share.popoverPresentationController?.sourceView = presenter.view
        share.popoverPresentationController?.sourceRect = CGRect(
            x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY, width: 0, height: 0)
        presenter.present(share, animated: true)
    }

    private enum Strings {
        static let downloadRefused = "이 파일은 앱에서 안전하게 다운로드할 수 없어요."
        static let downloadFailed = "다운로드하지 못했어요. 잠시 후 다시 시도해 주세요."
    }
}
