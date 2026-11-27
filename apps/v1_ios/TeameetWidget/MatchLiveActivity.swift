import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct MatchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MatchActivityAttributes.self) { context in
            MatchActivityCard(state: context.state, stale: context.isStale)
                .activityBackgroundTint(.black)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(WidgetEnvironment.current.origin.appendingPathComponent("my/schedule"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    MatchActivityTeam(name: context.state.teamName, logoKey: context.state.teamLogoKey, size: 28)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    MatchActivityTeam(name: context.state.opponentName, logoKey: context.state.opponentLogoKey, size: 28)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(WidgetFormat.score(context.state.score)).font(.title.bold()).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Spacer(minLength: 0)
                        VStack(spacing: 3) {
                            MatchActivityClock(state: context.state, stale: context.isStale)
                            if let penalties = context.state.penalties { Text("승부차기 \(WidgetFormat.score(penalties))").font(.caption2) }
                        }
                        Spacer(minLength: 0)
                    }
                }
            } compactLeading: {
                Text(context.isStale ? "갱신 지연" : context.state.status).font(.caption2.bold()).lineLimit(1)
            } compactTrailing: {
                HStack(spacing: 4) {
                    Text(WidgetFormat.score(context.state.score)).bold()
                    if !context.isStale && context.state.state != "ENDED" {
                        MatchActivityClock(state: context.state, stale: false, compact: true)
                    }
                }.font(.caption2).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            } minimal: {
                Text(context.isStale ? "—" : WidgetFormat.score(context.state.score)).font(.caption2.bold()).monospacedDigit()
            }
            .keylineTint(.white)
            .widgetURL(WidgetEnvironment.current.origin.appendingPathComponent("my/schedule"))
        }
    }
}

@available(iOS 16.2, *)
struct MatchActivityCard: View {
    let state: MatchActivityState
    var stale = false
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Text(stale ? "업데이트 지연" : state.status).font(.caption.bold())
                    .foregroundStyle(stale || state.state == "PAUSED" || state.period?.phase == "HALFTIME" ? .orange : .white)
                Spacer(minLength: 0)
                Text([state.competitionName, state.venueName].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2).lineLimit(1).foregroundStyle(.white.opacity(0.8))
            }
            HStack(spacing: 12) {
                MatchActivityTeam(name: state.teamName, logoKey: state.teamLogoKey, size: 36).frame(maxWidth: .infinity)
                VStack(spacing: 3) {
                    Text(WidgetFormat.score(state.score)).font(.system(.largeTitle, design: .rounded).bold()).monospacedDigit()
                    if let penalties = state.penalties { Text("승부차기 \(WidgetFormat.score(penalties))").font(.caption2) }
                }
                MatchActivityTeam(name: state.opponentName, logoKey: state.opponentLogoKey, size: 36).frame(maxWidth: .infinity)
            }
            MatchActivityClock(state: state, stale: stale)
        }.padding(16).foregroundStyle(.white)
    }
}

@available(iOS 16.2, *)
struct MatchActivityTeam: View {
    let name: String
    let logoKey: String?
    let size: CGFloat
    private var image: UIImage? {
        guard let logoKey, logoKey.count == 68, logoKey.hasSuffix(".png"),
              logoKey.dropLast(4).allSatisfy({ $0.isHexDigit }), let store = try? WidgetStore() else { return nil }
        return UIImage(contentsOfFile: store.directory.appendingPathComponent("logos").appendingPathComponent(logoKey).path)
    }
    var body: some View {
        VStack(spacing: 4) {
            Group {
                if let image { Image(uiImage: image).resizable().scaledToFit() }
                else { Text(String(name.prefix(1))).font(.caption.bold()).frame(maxWidth: .infinity, maxHeight: .infinity).background(.white.opacity(0.15)) }
            }.frame(width: size, height: size).clipShape(Circle()).accessibilityHidden(true)
            Text(name).font(.caption.bold()).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.8)
        }
    }
}

@available(iOS 16.2, *)
struct MatchActivityClock: View {
    let state: MatchActivityState
    var stale = false
    var compact = false
    var body: some View {
        HStack(spacing: 3) {
            if stale { Text("앱에서 최신 점수를 확인해 주세요") }
            else if state.state == "ENDED" { Text("경기 종료") }
            else if let period = state.period {
                if period.phase == "HALFTIME" {
                    Text("휴식")
                    if period.restStartedAt >= 0 { Text(WidgetFormat.date(period.restStartedAt), style: .timer).monospacedDigit().frame(width: compact ? 36 : 56, alignment: .leading) }
                } else {
                    Text(compact ? state.shortPeriod : WidgetFormat.periodName(period.number))
                        .fixedSize(horizontal: true, vertical: false)
                    let elapsed = WidgetFormat.elapsedMs(period, now: state.updatedAt)
                    if elapsed >= 0 {
                        if period.pausedAt >= 0 || state.state == "PAUSED" || period.phase == "PAUSED" {
                            Text(WidgetFormat.minuteMark(elapsed))
                        } else { Text(WidgetFormat.date(state.updatedAt - elapsed), style: .timer).monospacedDigit().frame(width: compact ? 36 : 56, alignment: .leading) }
                    }
                }
            } else if !compact { Text("경기 중") }
        }.font(compact ? .caption2 : .caption).lineLimit(1)
    }
}
