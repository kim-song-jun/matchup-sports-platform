package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class WidgetFormatTest {
    // 2026-11-27 12:00 KST
    private static final long NOW = java.time.ZonedDateTime.of(2026, 11, 27, 12, 0, 0, 0, WidgetFormat.SEOUL).toInstant().toEpochMilli();
    private static long at(int month, int day, int hour, int minute) {
        return java.time.ZonedDateTime.of(2026, month, day, hour, minute, 0, 0, WidgetFormat.SEOUL).toInstant().toEpochMilli();
    }

    @Test public void remainingUsesMinutesHoursDays() {
        assertEquals("40분 남았어요", WidgetFormat.remaining(NOW + 40 * 60_000L, NOW));
        assertEquals("1분 남았어요", WidgetFormat.remaining(NOW + 10_000L, NOW));
        assertEquals("3시간 남았어요", WidgetFormat.remaining(NOW + 3 * 3_600_000L + 59 * 60_000L, NOW));
        assertEquals("2일 남았어요", WidgetFormat.remaining(NOW + 49 * 3_600_000L, NOW));
        assertEquals("마감됐어요", WidgetFormat.remaining(NOW - 1, NOW));
    }

    @Test public void dayWordIsTodayTomorrowOrDate() {
        assertEquals("오늘", WidgetFormat.dayWord(at(11, 27, 23, 30), NOW));
        assertEquals("내일", WidgetFormat.dayWord(at(11, 28, 0, 10), NOW));
        assertEquals("12/1(화)", WidgetFormat.dayWord(at(12, 1, 19, 0), NOW));
    }

    @Test public void clockAndPeriodNames() {
        assertEquals("19:05", WidgetFormat.clock(at(11, 27, 19, 5)));
        assertEquals("전반", WidgetFormat.periodName(1));
        assertEquals("후반", WidgetFormat.periodName(2));
        assertEquals("3구간", WidgetFormat.periodName(3));
    }

    @Test public void elapsedSubtractsPausesAndCurrentPause() {
        long start = NOW - 20 * 60_000L;
        assertEquals(20 * 60_000L, WidgetFormat.elapsedMs(new WidgetModel.Period(1, "RUNNING", start, 0, -1, -1), NOW));
        assertEquals(19 * 60_000L, WidgetFormat.elapsedMs(new WidgetModel.Period(1, "RUNNING", start, 60_000, -1, -1), NOW));
        // 지금 5분째 멈춰 있으면 그 5분도 뺀다.
        assertEquals(15 * 60_000L, WidgetFormat.elapsedMs(new WidgetModel.Period(1, "PAUSED", start, 0, NOW - 5 * 60_000L, -1), NOW));
        assertEquals(-1, WidgetFormat.elapsedMs(new WidgetModel.Period(1, "RUNNING", -1, 0, -1, -1), NOW));
        assertEquals(-1, WidgetFormat.elapsedMs(null, NOW));
        assertEquals("12'", WidgetFormat.minuteMark(12 * 60_000L + 59_000));
    }

    @Test public void restAndScorerLines() {
        assertEquals("8분째 휴식", WidgetFormat.restFor(NOW - 8 * 60_000L - 5_000, NOW));
        assertEquals("휴식 중", WidgetFormat.restFor(-1, NOW));
        assertEquals("김OO 5'", WidgetFormat.scorerLine(new WidgetModel.Scorer(true, "김OO", 5, false)));
        assertEquals("득점 17'", WidgetFormat.scorerLine(new WidgetModel.Scorer(false, null, 17, false)));
        assertEquals("최OO (자책) 3'", WidgetFormat.scorerLine(new WidgetModel.Scorer(false, "최OO", 3, true)));
        assertEquals("득점", WidgetFormat.scorerLine(new WidgetModel.Scorer(false, null, -1, false)));
    }

    @Test public void savedMessageFollowsWhatTheServerSaved() {
        assertEquals("참석으로 저장했어요", WidgetFormat.savedMessage("GOING"));
        assertEquals("불참으로 저장했어요", WidgetFormat.savedMessage("NOT_GOING"));
        assertEquals("정원이 차서 대기로 등록했어요", WidgetFormat.savedMessage("WAITLISTED"));
        assertEquals("저장하지 못했어요. 앱에서 응답해 주세요", WidgetFormat.savedMessage(null));
    }

    @Test public void savedStatusReadsTheResponseOrFallsBackToTheRequest() {
        assertEquals("WAITLISTED", WidgetApi.savedStatus("{\"data\":{\"status\":\"WAITLISTED\"}}", "GOING"));
        assertEquals("GOING", WidgetApi.savedStatus("{\"status\":\"GOING\"}", "GOING"));
        assertEquals("GOING", WidgetApi.savedStatus("not json", "GOING"));
        assertEquals("NOT_GOING", WidgetApi.savedStatus("{\"data\":{}}", "NOT_GOING"));
    }
}
