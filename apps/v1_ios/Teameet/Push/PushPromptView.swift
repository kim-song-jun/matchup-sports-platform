import SwiftUI

/// The shell's own question, shown before the system's.
///
/// This is the one piece of interface the shell owns beyond an error screen, and it is here
/// for a reason the web cannot solve on its own: iOS shows its permission dialog once, and
/// the only place the web asks for it is a settings screen a reader has to go looking for.
///
/// Written to be skippable without cost. 나중에 leaves the system status untouched, so the
/// real dialog is still available later — which is exactly what makes asking here safe.
struct PushPromptView: View {

    let onAccept: () -> Void
    let onDefer: () -> Void

    var body: some View {
        ZStack {
            // Dimmed, but the sheet is the only way out: dismissing by tapping away would
            // read as neither answer and leave the reader unsure whether they were asked.
            Color.black.opacity(0.4).ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "bell.badge.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)

                VStack(spacing: 8) {
                    Text("경기 소식을 놓치지 마세요")
                        .font(.title3.bold())
                        .multilineTextAlignment(.center)
                    Text("참가 신청 수락, 경기 시작 알림, 팀 채팅을\n앱에서 바로 받아볼 수 있어요.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 10) {
                    Button(action: onAccept) {
                        Text("알림 받기")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    // Identified explicitly. The label alone is ambiguous — the web app has
                    // its own notification controls with overlapping wording, and a test (or
                    // a VoiceOver rotor) that goes by text can land on the wrong one.
                    .accessibilityIdentifier("push-prompt-accept")

                    Button(action: onDefer) {
                        Text("나중에")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("push-prompt-defer")
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(.systemBackground)))
            .padding(.horizontal, 32)
        }
        // One element for VoiceOver to land on, and an explicit hint that declining is safe —
        // the cost of "나중에" is the thing a reader cannot see.
        .accessibilityElement(children: .contain)
        .accessibilityLabel("알림 받기 안내")
        .accessibilityHint("나중에를 선택해도 설정에서 다시 켤 수 있어요")
    }
}
