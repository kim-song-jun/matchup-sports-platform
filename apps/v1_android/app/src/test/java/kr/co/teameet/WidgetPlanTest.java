package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import org.junit.Test;

public final class WidgetPlanTest {
    private static final long NOW = java.time.ZonedDateTime.of(2026, 11, 27, 12, 0, 0, 0, WidgetFormat.SEOUL).toInstant().toEpochMilli();
    private static long hoursFromNow(int hours) { return NOW + hours * 3_600_000L; }

    private static WidgetModel model(String live, String pending, String schedules) throws Exception {
        return WidgetModel.parse("{\"data\":{\"live\":[" + live + "],\"pending\":[" + pending + "],\"schedules\":[" + schedules + "],\"lastResult\":{\"teamName\":\"a\",\"score\":{\"mine\":1,\"opponent\":0},\"result\":\"WIN\"}}}");
    }
    private static String game(String state) { return "{\"gameId\":\"g\",\"teamName\":\"a\",\"state\":\"" + state + "\",\"score\":{\"mine\":0,\"opponent\":0},\"scorers\":[]}"; }
    private static String schedule(String id, boolean canRespond, long startMs) {
        return "{\"scheduleId\":\"" + id + "\",\"title\":\"t\",\"type\":\"TRAINING\",\"startAt\":\"" + java.time.Instant.ofEpochMilli(startMs) + "\",\"canRespond\":" + canRespond + "}";
    }

    @Test public void liveWinsOverEverything() throws Exception {
        WidgetPlan plan = WidgetPlan.of(model(game("LIVE"), schedule("p", true, hoursFromNow(3)), schedule("s", false, hoursFromNow(4))), NOW);
        assertEquals(WidgetPlan.Kind.LIVE, plan.kind);
    }

    @Test public void justEndedStillCountsAsLive() throws Exception {
        assertEquals(WidgetPlan.Kind.LIVE, WidgetPlan.of(model(game("ENDED"), "", ""), NOW).kind);
    }

    @Test public void pendingBeatsSchedule() throws Exception {
        WidgetPlan plan = WidgetPlan.of(model("", schedule("p", true, hoursFromNow(3)), schedule("s", false, hoursFromNow(4))), NOW);
        assertEquals(WidgetPlan.Kind.PENDING, plan.kind);
        assertEquals("p", plan.schedule.scheduleId);
    }

    @Test public void pendingThatCannotBeAnsweredIsSkipped() throws Exception {
        WidgetPlan plan = WidgetPlan.of(model("", schedule("p", false, hoursFromNow(3)), schedule("s", false, hoursFromNow(4))), NOW);
        assertEquals(WidgetPlan.Kind.SCHEDULE, plan.kind);
    }

    @Test public void scheduleShowsNextDayLineOnlyForADifferentDay() throws Exception {
        // 오늘 20:00 경기 · 같은 날 22:00 · 내일 19:00 훈련 → 「내일」 줄은 내일 것.
        WidgetPlan plan = WidgetPlan.of(model("", "", schedule("a", false, hoursFromNow(8)) + "," + schedule("b", false, hoursFromNow(10)) + "," + schedule("c", false, hoursFromNow(31))), NOW);
        assertEquals(WidgetPlan.Kind.SCHEDULE, plan.kind);
        assertEquals("a", plan.schedule.scheduleId);
        assertEquals("c", plan.tomorrow.scheduleId);
        WidgetPlan single = WidgetPlan.of(model("", "", schedule("a", false, hoursFromNow(8))), NOW);
        assertNull(single.tomorrow);
    }

    @Test public void emptyCarriesTheLastResult() throws Exception {
        WidgetPlan plan = WidgetPlan.of(model("", "", ""), NOW);
        assertEquals(WidgetPlan.Kind.EMPTY, plan.kind);
        assertEquals("WIN", plan.lastResult.result);
    }
}
