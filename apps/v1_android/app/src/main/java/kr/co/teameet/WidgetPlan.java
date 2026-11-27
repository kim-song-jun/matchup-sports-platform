package kr.co.teameet;

import java.util.ArrayList;
import java.util.List;

/**
 * 어떤 화면을 보일지 정한다. 순서는 확정 디자인대로 <b>경기 중 → 응답 대기 → 일정 → 아무것도 없음</b>이다.
 * 같은 규칙을 중간·정사각형 위젯이 함께 쓴다.
 */
final class WidgetPlan {
    enum Kind { LIVE, PENDING, SCHEDULE, EMPTY }

    final Kind kind;
    final WidgetModel.Live live;
    final WidgetModel.Schedule schedule;
    /** 일정 화면의 「내일」 한 줄 — 첫 일정과 다른 날의 다음 일정. 없으면 null. */
    final WidgetModel.Schedule tomorrow;
    final WidgetModel.LastResult lastResult;

    private WidgetPlan(Kind kind, WidgetModel.Live live, WidgetModel.Schedule schedule, WidgetModel.Schedule tomorrow, WidgetModel.LastResult lastResult) {
        this.kind = kind;
        this.live = live;
        this.schedule = schedule;
        this.tomorrow = tomorrow;
        this.lastResult = lastResult;
    }

    static WidgetPlan of(WidgetModel model, long nowMs) {
        WidgetModel.Live live = firstLive(model.live);
        if (live != null) return new WidgetPlan(Kind.LIVE, live, null, null, null);
        for (WidgetModel.Schedule pending : model.pending) {
            if (pending.canRespond) return new WidgetPlan(Kind.PENDING, null, pending, null, null);
        }
        if (!model.schedules.isEmpty()) {
            WidgetModel.Schedule first = model.schedules.get(0);
            return new WidgetPlan(Kind.SCHEDULE, null, first, nextDay(model.schedules, first, nowMs), null);
        }
        return new WidgetPlan(Kind.EMPTY, null, null, null, model.lastResult);
    }

    /** 진행 중(LIVE·PAUSED)이 방금 끝난 경기보다 앞. 서버가 이미 그 순서로 준다. */
    private static WidgetModel.Live firstLive(List<WidgetModel.Live> list) {
        return list.isEmpty() ? null : list.get(0);
    }

    /** 첫 일정과 **다른 날**의 가장 가까운 일정. 같은 날이면 건너뛴다(「내일」 줄이니까). */
    private static WidgetModel.Schedule nextDay(List<WidgetModel.Schedule> schedules, WidgetModel.Schedule first, long nowMs) {
        String firstDay = WidgetFormat.dayWord(first.startAtMs, nowMs);
        List<WidgetModel.Schedule> rest = new ArrayList<>(schedules.subList(1, schedules.size()));
        for (WidgetModel.Schedule next : rest) {
            if (!WidgetFormat.dayWord(next.startAtMs, nowMs).equals(firstDay)) return next;
        }
        return null;
    }
}
