import WidgetKit
import SwiftUI
import AppIntents

struct HomeEntry: TimelineEntry {
    var date: Date
    var snapshot: WidgetSnapshot
}
struct HomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeEntry { HomeEntry(date: Date(), snapshot: WidgetSnapshot(notice: "팀밋 홈 위젯")) }
    func getSnapshot(in context: Context, completion: @escaping (HomeEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<HomeEntry>) -> Void) {
        Task {
            var snapshot: WidgetSnapshot
            do {
                let store = try WidgetStore()
                let api = WidgetAPI()
                snapshot = await WidgetService(store: store, api: api).refresh()
                if let model = snapshot.model, !snapshot.stale {
                    await WidgetLogos.prefetch(model: model, store: store, revision: snapshot.revision,
                                               environment: api.environment, maxCount: WidgetLogoPolicy.extensionLimit)
                    if try store.read().revision != snapshot.revision {
                        snapshot = WidgetSnapshot(notice: WidgetFailure.changedSession.localizedDescription)
                    }
                }
            }
            catch { snapshot = WidgetSnapshot(notice: "위젯 저장소를 열지 못했어요") }
            let now = Date()
            var dates = (0...30).map { now.addingTimeInterval(Double($0 * 60)) }
            if snapshot.updatedAt >= 0 {
                let expiry = WidgetFormat.date(snapshot.updatedAt + WidgetStore.cacheLifetime)
                if expiry > now { dates.append(expiry) }
            }
            let entries = Array(Set(dates)).sorted().map { HomeEntry(date: $0, snapshot: snapshot) }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(1800))))
        }
    }
}

@available(iOS 17.0, *)
struct AttendanceIntent: AppIntent {
    static let title: LocalizedStringResource = "팀 일정 참석 응답"
    @Parameter(title: "일정") var scheduleID: String
    @Parameter(title: "세션") var revision: String
    @Parameter(title: "참석") var going: Bool
    init() {}
    init(id: String, revision: String, going: Bool) { self.scheduleID = id; self.revision = revision; self.going = going }
    func perform() async throws -> some IntentResult {
        defer { WidgetCenter.shared.reloadAllTimelines() }
        try await WidgetService(store: WidgetStore(), api: WidgetAPI()).respond(id: scheduleID, going: going, revision: revision)
        return .result()
    }
}

struct HomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HomeEntry
    var previewFamily: WidgetFamily? = nil
    private var small: Bool { (previewFamily ?? family) == .systemSmall }
    private var now: Int64 { Int64(entry.date.timeIntervalSince1970 * 1000) }
    private var expired: Bool { entry.snapshot.updatedAt >= 0 && now - entry.snapshot.updatedAt >= WidgetStore.cacheLifetime }
    var body: some View {
        let content = VStack(alignment: .leading, spacing: 8) {
            if let model = entry.snapshot.model, !expired {
                let plan = currentPlan(model)
                if let notice = entry.snapshot.notice { Text("업데이트 지연 · " + notice).font(.caption2).lineLimit(2) }
                switch plan.kind {
                case .live: if let game = plan.live { live(game) }
                case .pending: if let schedule = plan.schedule { pending(schedule) }
                case .schedule: if let schedule = plan.schedule { agenda(schedule, next: plan.tomorrow) }
                case .empty:
                    Text(plan.lastResult?.teamName ?? "팀밋").font(.caption.bold())
                    Spacer(minLength: 0)
                    Text("예정된 일정이 없어요").font(.headline)
                    Spacer(minLength: 0)
                    if let result = plan.lastResult { Text("지난 경기 \(WidgetFormat.score(result.score)) · \(result.result == "WIN" ? "승" : result.result == "LOSE" ? "패" : "무")").font(.caption) }
                }
            } else {
                Text("팀밋").font(.headline)
                Spacer()
                Text(expired ? "정보가 오래됐어요. 앱에서 새로고침해 주세요" : entry.snapshot.notice ?? "앱에서 로그인해 주세요").font(.subheadline)
                Spacer()
            }
        }.foregroundStyle(.white).widgetURL(WidgetEnvironment.current.origin.appendingPathComponent("my/schedule"))
        if #available(iOS 17.0, *) { content.containerBackground(for: .widget) { background } }
        else { content.padding().background(background) }
    }
    private func currentPlan(_ model: WidgetModel) -> WidgetPlan {
        WidgetPresentation.plan(model, updatedAt: entry.snapshot.updatedAt, now: now)
    }
    private var background: some View { LinearGradient(colors: [Color(red: 0.21, green: 0.30, blue: 0.49), Color(red: 0.13, green: 0.18, blue: 0.31)], startPoint: .topLeading, endPoint: .bottomTrailing) }
    private func logo(_ name: String, path: String?) -> some View {
        Group {
            if let image = WidgetLogos.image(path, store: try? WidgetStore()) { Image(uiImage: image).resizable().scaledToFit() }
            else { Text(String(name.prefix(1))).font(.caption.bold()).frame(maxWidth: .infinity, maxHeight: .infinity).background(.white.opacity(0.15)) }
        }.frame(width: small ? 24 : 32, height: small ? 24 : 32).clipShape(Circle()).accessibilityHidden(true)
    }
    @ViewBuilder private func live(_ g: WidgetModel.Live) -> some View {
        HStack(spacing: 4) {
            Text(g.state == "ENDED" ? "방금 끝남" : g.period?.phase == "HALFTIME" ? "● 하프타임" : g.state == "PAUSED" ? "● 일시정지" : "● LIVE")
                .foregroundStyle(g.state == "PAUSED" || g.period?.phase == "HALFTIME" ? .orange : .white)
            if !small { Text(g.competitionName ?? "").lineLimit(1) }
            if let p = g.period {
                if p.phase == "HALFTIME" { Text(WidgetFormat.restFor(p.restStartedAt, now: now)) }
                else if p.startedAt >= 0 {
                    Text(WidgetFormat.periodName(p.number))
                    if p.pausedAt >= 0 || g.state == "PAUSED" { Text(WidgetFormat.minuteMark(WidgetFormat.elapsedMs(p, now: now))) }
                    else { Text(WidgetFormat.date(now - WidgetFormat.elapsedMs(p, now: now)), style: .timer).monospacedDigit() }
                }
            }
        }.font(.caption2.bold()).lineLimit(1).minimumScaleFactor(0.7)
        Spacer(minLength: 0)
        if small {
            teamRow(g.teamName, path: g.teamLogoUrl, score: g.score?.mine)
            teamRow(g.opponentName ?? "상대팀", path: g.opponentLogoUrl, score: g.score?.opponent)
        } else {
            HStack {
                VStack { logo(g.teamName, path: g.teamLogoUrl); Text(g.teamName).font(.caption.bold()).lineLimit(2) }.frame(maxWidth: .infinity)
                Text(WidgetFormat.score(g.score)).font(.system(.largeTitle, design: .rounded).bold()).minimumScaleFactor(0.7)
                VStack { logo(g.opponentName ?? "상대팀", path: g.opponentLogoUrl); Text(g.opponentName ?? "상대팀").font(.caption.bold()).lineLimit(2) }.frame(maxWidth: .infinity)
            }
        }
        if let penalties = g.penalties { Text("승부차기 \(WidgetFormat.score(penalties))").font(.caption2) }
        Spacer(minLength: 0)
        HStack {
            scorer(g.scorers.last { $0.side == "MINE" })
            if !small { scorer(g.scorers.last { $0.side == "OPPONENT" }) }
        }
    }
    private func teamRow(_ name: String, path: String?, score: Int?) -> some View {
        HStack { logo(name, path: path); Text(name).font(.caption.bold()).lineLimit(2); Spacer(minLength: 0); Text(score.map(String.init) ?? "—").font(.title.bold()) }
    }
    private func scorer(_ scorer: WidgetModel.Scorer?) -> some View {
        Text(scorer.map { "⚽ " + WidgetFormat.scorerLine($0) } ?? " ").font(.caption2.bold()).lineLimit(1).minimumScaleFactor(0.75)
            .frame(maxWidth: .infinity).padding(5).background(.white.opacity(scorer == nil ? 0 : 0.13), in: Capsule())
    }
    private func pending(_ s: WidgetModel.Schedule) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("응답 대기" + (!small && s.rsvpDeadlineAt >= 0 ? " · " + WidgetFormat.remaining(s.rsvpDeadlineAt, now: now) : "")).font(.caption.bold()).lineLimit(1)
            Spacer(minLength: 0)
            HStack {
                Text("\(WidgetFormat.clock(s.startAt)) \(s.title)").font(.headline).lineLimit(2)
                if !small && s.capacity > 0 {
                    ZStack { Circle().stroke(.white.opacity(0.3), lineWidth: 3); Circle().trim(from: 0, to: min(1, CGFloat(s.goingCount) / CGFloat(s.capacity))).stroke(.white, lineWidth: 3).rotationEffect(.degrees(-90)); Text("\(s.goingCount)/\(s.capacity)").font(.caption2.bold()) }.frame(width: 40, height: 40)
                }
            }
            if small && s.rsvpDeadlineAt >= 0 { Text(WidgetFormat.remaining(s.rsvpDeadlineAt, now: now)).font(.caption2) }
            if !small, let place = s.placeName { Text("📍 " + place).font(.caption2).lineLimit(1) }
            Spacer(minLength: 0)
            if #available(iOS 17.0, *), !entry.snapshot.stale {
                HStack {
                    action(s, going: true)
                    action(s, going: false)
                }
            } else { Text("앱에서 참석 여부를 알려주세요").font(.caption) }
        }
    }
    @available(iOS 17.0, *) private func action(_ s: WidgetModel.Schedule, going: Bool) -> some View {
        Button(intent: AttendanceIntent(id: s.scheduleId, revision: entry.snapshot.revision, going: going)) {
            Text(going ? "참석" : "불참").font(.caption.bold()).frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(going ? Color(red: 0.1, green: 0.15, blue: 0.3) : .white)
                .background(going ? .white : .white.opacity(0.18), in: Capsule())
        }.buttonStyle(.plain)
    }
    private func agenda(_ s: WidgetModel.Schedule, next: WidgetModel.Schedule?) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(WidgetFormat.dayWord(s.startAt, now: now)).font(.caption.bold())
            Spacer(minLength: 0)
            Text(WidgetFormat.clock(s.startAt)).font(.largeTitle.bold())
            Text(s.opponentName.map { "vs " + $0 } ?? s.title).font(.headline).lineLimit(2)
            if s.myResponse == "WAITLISTED" { Text("정원이 차서 대기 중이에요").font(.caption2.bold()).lineLimit(1) }
            if let competition = s.competitionName { Text(competition).font(.caption2).lineLimit(1) }
            if let place = s.placeName { Text("📍 " + place).font(.caption2).lineLimit(1) }
            Spacer(minLength: 0)
            if !small, let next { Divider().overlay(.white.opacity(0.3)); Text("\(WidgetFormat.dayWord(next.startAt, now: now)) \(WidgetFormat.clock(next.startAt)) \(next.title)").font(.caption2).lineLimit(1) }
        }
    }
}
