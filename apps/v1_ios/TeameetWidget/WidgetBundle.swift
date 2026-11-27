import WidgetKit
import SwiftUI
@main
struct TeameetHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TeameetHome", provider: HomeProvider()) { HomeWidgetView(entry: $0) }
            .configurationDisplayName("팀밋 홈").description("내 팀 경기와 일정, 참석 응답을 확인해요")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}
