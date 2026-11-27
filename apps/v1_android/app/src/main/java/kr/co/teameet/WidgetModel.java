package kr.co.teameet;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * `GET /api/v1/widget/home` 응답을 읽은 값. 화면 판단은 {@link WidgetPlan}, 글자 만들기는 {@link WidgetFormat} 이 한다.
 * 읽을 수 없는 항목은 건너뛰고(위젯은 일부가 비어도 그려야 한다), 응답 전체가 깨졌을 때만 {@link JSONException}.
 */
final class WidgetModel {
    static final class Period {
        final int number;
        /** RUNNING · HALFTIME · PAUSED */
        final String phase;
        final long startedAtMs;
        final long pausedMs;
        final long pausedAtMs;
        final long restStartedAtMs;

        Period(int number, String phase, long startedAtMs, long pausedMs, long pausedAtMs, long restStartedAtMs) {
            this.number = number;
            this.phase = phase;
            this.startedAtMs = startedAtMs;
            this.pausedMs = pausedMs;
            this.pausedAtMs = pausedAtMs;
            this.restStartedAtMs = restStartedAtMs;
        }
    }

    static final class Scorer {
        /** true 면 우리 팀 골. */
        final boolean mine;
        /** 이름을 보여 줄 수 없으면 null. */
        final String name;
        /** 분을 모르면 -1. */
        final int minute;
        final boolean ownGoal;

        Scorer(boolean mine, String name, int minute, boolean ownGoal) {
            this.mine = mine;
            this.name = name;
            this.minute = minute;
            this.ownGoal = ownGoal;
        }
    }

    static final class Live {
        final String gameId;
        final String teamName;
        final String teamLogoUrl;
        final String opponentName;
        final String opponentLogoUrl;
        final String competitionName;
        final String venueName;
        /** LIVE · PAUSED · ENDED(방금 끝남) */
        final String state;
        /** 점수를 가린 경기는 -1. */
        final int mine;
        final int opponent;
        final boolean hasPenalties;
        final int penaltyMine;
        final int penaltyOpponent;
        final Period period;
        final List<Scorer> scorers;

        Live(String gameId, String teamName, String teamLogoUrl, String opponentName, String opponentLogoUrl, String competitionName,
             String venueName, String state, int mine, int opponent, boolean hasPenalties, int penaltyMine, int penaltyOpponent,
             Period period, List<Scorer> scorers) {
            this.gameId = gameId;
            this.teamName = teamName;
            this.teamLogoUrl = teamLogoUrl;
            this.opponentName = opponentName;
            this.opponentLogoUrl = opponentLogoUrl;
            this.competitionName = competitionName;
            this.venueName = venueName;
            this.state = state;
            this.mine = mine;
            this.opponent = opponent;
            this.hasPenalties = hasPenalties;
            this.penaltyMine = penaltyMine;
            this.penaltyOpponent = penaltyOpponent;
            this.period = period;
            this.scorers = scorers;
        }

        boolean scoreVisible() {
            return mine >= 0 && opponent >= 0;
        }
    }

    static final class Schedule {
        final String scheduleId;
        final String teamName;
        final String teamLogoUrl;
        final String title;
        /** TRAINING · MATCH · EVENT … */
        final String type;
        final long startAtMs;
        final long rsvpDeadlineAtMs;
        final String placeName;
        final String opponentName;
        final String opponentLogoUrl;
        final String competitionName;
        final int goingCount;
        final int capacity;
        final boolean canRespond;

        Schedule(String scheduleId, String teamName, String teamLogoUrl, String title, String type, long startAtMs, long rsvpDeadlineAtMs,
                 String placeName, String opponentName, String opponentLogoUrl, String competitionName, int goingCount, int capacity,
                 boolean canRespond) {
            this.scheduleId = scheduleId;
            this.teamName = teamName;
            this.teamLogoUrl = teamLogoUrl;
            this.title = title;
            this.type = type;
            this.startAtMs = startAtMs;
            this.rsvpDeadlineAtMs = rsvpDeadlineAtMs;
            this.placeName = placeName;
            this.opponentName = opponentName;
            this.opponentLogoUrl = opponentLogoUrl;
            this.competitionName = competitionName;
            this.goingCount = goingCount;
            this.capacity = capacity;
            this.canRespond = canRespond;
        }
    }

    static final class LastResult {
        final String teamName;
        final String opponentName;
        final int mine;
        final int opponent;
        /** WIN · DRAW · LOSE */
        final String result;

        LastResult(String teamName, String opponentName, int mine, int opponent, String result) {
            this.teamName = teamName;
            this.opponentName = opponentName;
            this.mine = mine;
            this.opponent = opponent;
            this.result = result;
        }
    }

    final long generatedAtMs;
    final List<Live> live;
    final LastResult lastResult;
    final int pendingCount;
    final List<Schedule> pending;
    final List<Schedule> schedules;

    private WidgetModel(long generatedAtMs, List<Live> live, LastResult lastResult, int pendingCount, List<Schedule> pending, List<Schedule> schedules) {
        this.generatedAtMs = generatedAtMs;
        this.live = live;
        this.lastResult = lastResult;
        this.pendingCount = pendingCount;
        this.pending = pending;
        this.schedules = schedules;
    }

    static WidgetModel empty(long nowMs) {
        return new WidgetModel(nowMs, Collections.emptyList(), null, 0, Collections.emptyList(), Collections.emptyList());
    }

    static WidgetModel parse(String json) throws JSONException {
        JSONObject root = new JSONObject(json);
        JSONObject data = root.has("data") && !root.isNull("data") ? root.getJSONObject("data") : root;
        List<Live> live = new ArrayList<>();
        JSONArray liveArray = data.optJSONArray("live");
        for (int i = 0; liveArray != null && i < liveArray.length(); i++) {
            JSONObject o = liveArray.optJSONObject(i);
            if (o != null) live.add(readLive(o));
        }
        JSONObject last = data.optJSONObject("lastResult");
        return new WidgetModel(
            millis(data, "generatedAt", System.currentTimeMillis()),
            live,
            last == null ? null : readLastResult(last),
            data.optInt("pendingCount", 0),
            readSchedules(data.optJSONArray("pending")),
            readSchedules(data.optJSONArray("schedules")));
    }

    private static Live readLive(JSONObject o) {
        JSONObject score = o.optJSONObject("score");
        JSONObject penalties = o.optJSONObject("penalties");
        List<Scorer> scorers = new ArrayList<>();
        JSONArray scorerArray = o.optJSONArray("scorers");
        for (int i = 0; scorerArray != null && i < scorerArray.length(); i++) {
            JSONObject s = scorerArray.optJSONObject(i);
            if (s == null) continue;
            scorers.add(new Scorer("MINE".equals(s.optString("side")), str(s, "name"), s.isNull("minute") ? -1 : s.optInt("minute", -1), s.optBoolean("ownGoal", false)));
        }
        return new Live(
            o.optString("gameId"),
            o.optString("teamName"),
            str(o, "teamLogoUrl"),
            str(o, "opponentName"),
            str(o, "opponentLogoUrl"),
            str(o, "competitionName"),
            str(o, "venueName"),
            o.optString("state", "LIVE"),
            score == null ? -1 : score.optInt("mine", -1),
            score == null ? -1 : score.optInt("opponent", -1),
            penalties != null,
            penalties == null ? 0 : penalties.optInt("mine", 0),
            penalties == null ? 0 : penalties.optInt("opponent", 0),
            readPeriod(o.optJSONObject("period")),
            scorers);
    }

    private static Period readPeriod(JSONObject p) {
        if (p == null) return null;
        return new Period(p.optInt("number", 1), p.optString("phase", "RUNNING"), millis(p, "startedAt", -1), p.optLong("pausedMs", 0), millis(p, "pausedAt", -1), millis(p, "restStartedAt", -1));
    }

    private static List<Schedule> readSchedules(JSONArray array) {
        List<Schedule> list = new ArrayList<>();
        for (int i = 0; array != null && i < array.length(); i++) {
            JSONObject o = array.optJSONObject(i);
            if (o == null) continue;
            list.add(new Schedule(
                o.optString("scheduleId"), o.optString("teamName"), str(o, "teamLogoUrl"), o.optString("title"), o.optString("type"),
                millis(o, "startAt", -1), millis(o, "rsvpDeadlineAt", -1), str(o, "placeName"), str(o, "opponentName"), str(o, "opponentLogoUrl"),
                str(o, "competitionName"), o.optInt("goingCount", 0), o.optInt("capacity", 0), o.optBoolean("canRespond", false)));
        }
        return list;
    }

    private static LastResult readLastResult(JSONObject o) {
        JSONObject score = o.optJSONObject("score");
        return new LastResult(o.optString("teamName"), str(o, "opponentName"), score == null ? 0 : score.optInt("mine", 0), score == null ? 0 : score.optInt("opponent", 0), o.optString("result", "DRAW"));
    }

    private static String str(JSONObject o, String key) {
        if (!o.has(key) || o.isNull(key)) return null;
        String value = o.optString(key, "").trim();
        return value.isEmpty() ? null : value;
    }

    private static long millis(JSONObject o, String key, long fallback) {
        String value = str(o, key);
        if (value == null) return fallback;
        try {
            return Instant.parse(value).toEpochMilli();
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }
}
