package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class WidgetModelTest {
    private static final String HOME = "{\"status\":\"success\",\"data\":{"
        + "\"generatedAt\":\"2026-11-27T03:00:00.000Z\","
        + "\"live\":[{\"gameId\":\"g1\",\"teamName\":\"한강 로버스\",\"teamLogoUrl\":\"/images/team-logos/team-logo-07.jpg\",\"opponentName\":\"마포\",\"opponentLogoUrl\":null,"
        + "\"competitionName\":\"서울 나이트 풋살 리그\",\"venueName\":\"한강 풋살장\",\"state\":\"LIVE\",\"score\":{\"mine\":2,\"opponent\":1},\"penalties\":null,"
        + "\"period\":{\"number\":2,\"phase\":\"RUNNING\",\"startedAt\":\"2026-11-27T02:48:00.000Z\",\"pausedMs\":60000,\"pausedAt\":null,\"restStartedAt\":null},"
        + "\"scorers\":[{\"side\":\"MINE\",\"name\":\"김OO\",\"minute\":5,\"ownGoal\":false},{\"side\":\"OPPONENT\",\"name\":null,\"minute\":null,\"ownGoal\":true}]}],"
        + "\"lastResult\":{\"teamName\":\"한강 로버스\",\"opponentName\":\"마포\",\"score\":{\"mine\":2,\"opponent\":1},\"result\":\"WIN\"},"
        + "\"pendingCount\":1,"
        + "\"pending\":[{\"scheduleId\":\"s1\",\"teamName\":\"한강 로버스\",\"title\":\"팀 훈련\",\"type\":\"TRAINING\",\"startAt\":\"2026-11-27T10:00:00.000Z\",\"rsvpDeadlineAt\":\"2026-11-27T09:00:00.000Z\","
        + "\"placeName\":\"한강 구장\",\"goingCount\":8,\"capacity\":12,\"canRespond\":true}],"
        + "\"schedules\":[]}}";

    @Test public void readsLiveGameWithScorersAndPeriod() throws Exception {
        WidgetModel model = WidgetModel.parse(HOME);
        assertEquals(1, model.live.size());
        WidgetModel.Live live = model.live.get(0);
        assertEquals("한강 로버스", live.teamName);
        assertEquals("/images/team-logos/team-logo-07.jpg", live.teamLogoUrl);
        assertNull(live.opponentLogoUrl);
        assertEquals("서울 나이트 풋살 리그", live.competitionName);
        assertTrue(live.scoreVisible());
        assertEquals(2, live.mine);
        assertFalse(live.hasPenalties);
        assertEquals(2, live.period.number);
        assertEquals("RUNNING", live.period.phase);
        assertEquals(60_000, live.period.pausedMs);
        assertEquals(-1, live.period.pausedAtMs);
        assertEquals(2, live.scorers.size());
        assertTrue(live.scorers.get(0).mine);
        assertEquals("김OO", live.scorers.get(0).name);
        assertNull(live.scorers.get(1).name);
        assertEquals(-1, live.scorers.get(1).minute);
        assertTrue(live.scorers.get(1).ownGoal);
    }

    @Test public void hiddenScoreReadsAsInvisible() throws Exception {
        WidgetModel model = WidgetModel.parse("{\"data\":{\"live\":[{\"gameId\":\"g\",\"teamName\":\"a\",\"state\":\"LIVE\",\"score\":null,\"scorers\":[]}]}}");
        assertFalse(model.live.get(0).scoreVisible());
    }

    @Test public void readsPendingAndLastResultAndTolerantOfBrokenItems() throws Exception {
        WidgetModel model = WidgetModel.parse(HOME);
        assertEquals(1, model.pendingCount);
        WidgetModel.Schedule pending = model.pending.get(0);
        assertEquals("s1", pending.scheduleId);
        assertEquals(8, pending.goingCount);
        assertEquals(12, pending.capacity);
        assertTrue(pending.canRespond);
        assertEquals("한강 구장", pending.placeName);
        assertNotNull(model.lastResult);
        assertEquals("WIN", model.lastResult.result);

        WidgetModel sparse = WidgetModel.parse("{\"data\":{\"live\":[1,null,\"x\"],\"pending\":[{}],\"schedules\":null}}");
        assertEquals(0, sparse.live.size());
        assertEquals(1, sparse.pending.size());
        assertEquals(-1, sparse.pending.get(0).startAtMs);
    }

    @Test(expected = org.json.JSONException.class) public void rejectsNonJson() throws Exception {
        WidgetModel.parse("<html>502</html>");
    }
}
