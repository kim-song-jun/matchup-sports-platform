import SwiftUI

/// Shown when the web app could not be loaded.
///
/// This screen exists because iOS gives the shell nothing here. Android's WebView renders
/// Chromium's own error page for free, so `MainActivity` handles no errors at all; a
/// `WKWebView` that fails to load stays blank, and the user is left on an empty white
/// screen with no way to recover. Verified on the simulator, not assumed.
///
/// The copy says what happened and what will fix it, and never apologises — the shell is
/// reporting a network condition, not confessing.
struct LoadFailureView: View {

    let reason: WebShellFailureReason
    let onRetry: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                content
                    // Centres the message on a normal screen; at the largest Dynamic Type
                    // sizes the content outgrows this minimum and the scroll view takes
                    // over instead of clipping.
                    .frame(minHeight: proxy.size.height)
            }
        }
        .background(Color(.systemBackground))
        // The transition is applied by the parent from `WebShellModel.shellTransition` — the
        // model is the single source for Reduce Motion, so this view no longer reads it.
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(reason.title). \(reason.message)")
    }

    private var content: some View {
        VStack(spacing: 16) {
            Image(systemName: reason.symbolName)
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(.secondary)
                // The icon repeats what the text already says, so it carries no meaning
                // of its own and screen readers should skip it.
                .accessibilityHidden(true)

            Text(reason.title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)

            Text(reason.message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Button(action: onRetry) {
                Text("다시 시도")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.top, 8)
            .accessibilityHint("팀밋을 다시 불러와요")
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

private extension WebShellFailureReason {

    var symbolName: String {
        switch self {
        case .offline: return "wifi.slash"
        case .unreachable: return "antenna.radiowaves.left.and.right.slash"
        case .serverError: return "exclamationmark.triangle"
        case .interrupted: return "exclamationmark.circle"
        }
    }

    var title: String {
        switch self {
        case .offline: return "인터넷에 연결되어 있지 않아요"
        case .unreachable: return "지금은 팀밋에 연결할 수 없어요"
        case .serverError: return "팀밋 서버에 문제가 생겼어요"
        case .interrupted: return "화면을 열지 못했어요"
        }
    }

    var message: String {
        switch self {
        case .offline:
            // The shell watches for the network coming back and reloads on its own, so the
            // promise here is one it actually keeps.
            return "와이파이나 모바일 데이터를 켜면 다시 불러올게요."
        case .unreachable:
            return "네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        case .serverError(let statusCode):
            // A server error does not fix itself when the network returns, so this one asks
            // the user to come back. The code is included because it is the first thing
            // support will ask for.
            return "잠시 후 다시 시도해 주세요. (오류 \(statusCode))"
        case .interrupted:
            // The network is fine here, so this must not send the reader off to check
            // Wi-Fi. The link left for Safari, or the address returned a file instead of a
            // page; reloading the home screen is what actually recovers.
            return "다시 시도하면 처음 화면으로 돌아가요."
        }
    }
}

#Preview("오프라인") {
    LoadFailureView(reason: .offline, onRetry: {})
}

#Preview("서버 오류") {
    LoadFailureView(reason: .serverError(statusCode: 503), onRetry: {})
}
