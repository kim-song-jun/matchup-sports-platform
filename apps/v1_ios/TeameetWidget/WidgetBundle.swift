import WidgetKit
import SwiftUI
struct TeameetHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TeameetHome", provider: HomeProvider()) { HomeWidgetView(entry: $0) }
            .configurationDisplayName("팀밋 홈").description("내 팀 경기와 일정, 참석 응답을 확인해요")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TeameetLockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TeameetLock", provider: HomeProvider()) { LockWidgetView(entry: $0) }
            .configurationDisplayName("팀밋 잠금화면")
            .description("내 팀 경기와 다음 일정을 잠금화면에서 확인해요")
            .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

@main
struct TeameetWidgets: WidgetBundle {
    var body: some Widget {
        TeameetHomeWidget()
        TeameetLockWidget()
    }
}
