package kr.co.teameet;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** {@link WidgetPlan} 을 RemoteViews 로 그린다. 화면 판단은 Plan, 글자는 {@link WidgetFormat} 이 이미 정했다. */
final class WidgetRenderer {
    static final String ACTION_RESPOND = "kr.co.teameet.widget.RESPOND";
    static final String EXTRA_SCHEDULE_ID = "scheduleId";
    static final String EXTRA_STATUS = "status";
    /** 한 띠에 넣는 최근 골 수 — 넘기면 오래된 골부터 빠진다(위젯은 가볍게). */
    private static final int MAX_BELT_ITEMS = 12;

    private WidgetRenderer() {}

    static RemoteViews message(Context context, String title, String sub) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_message);
        rv.setTextViewText(R.id.msg_title, title);
        rv.setTextViewText(R.id.msg_sub, sub);
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 1));
        return rv;
    }

    static RemoteViews medium(Context context, WidgetPlan plan, long now, Map<String, Bitmap> logos) {
        switch (plan.kind) {
            case LIVE: return mediumLive(context, plan.live, now, logos);
            case PENDING: return mediumPending(context, plan.schedule, now);
            case SCHEDULE: return mediumSchedule(context, plan, now);
            default: return mediumEmpty(context, plan);
        }
    }

    static RemoteViews square(Context context, WidgetPlan plan, long now, Map<String, Bitmap> logos) {
        switch (plan.kind) {
            case LIVE: return squareLive(context, plan.live, now, logos);
            case PENDING: return squarePending(context, plan.schedule, now);
            case SCHEDULE: return squareSchedule(context, plan.schedule, now);
            default: return squareEmpty(context, plan);
        }
    }

    // ── 경기 중 ────────────────────────────────────────────────────────────────

    private static RemoteViews mediumLive(Context context, WidgetModel.Live live, long now, Map<String, Bitmap> logos) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_medium_live);
        Header header = header(live, now);
        rv.setImageViewResource(R.id.m_dot, dot(header, live));
        rv.setTextViewText(R.id.m_head, header.text);
        clock(rv, R.id.m_clock, header);
        rv.setTextViewText(R.id.m_score, live.scoreVisible() ? live.mine + ":" + live.opponent : "vs");
        logo(rv, R.id.m_logo1, logos.get(live.teamLogoUrl));
        logo(rv, R.id.m_logo2, logos.get(live.opponentLogoUrl));
        rv.setTextViewText(R.id.m_name1, live.teamName);
        rv.setTextViewText(R.id.m_name2, live.opponentName == null ? "상대팀" : live.opponentName);

        List<String> mine = new ArrayList<>();
        List<String> theirs = new ArrayList<>();
        for (WidgetModel.Scorer s : live.scorers) (s.mine ? mine : theirs).add(WidgetFormat.scorerLine(s));
        if (mine.isEmpty() && theirs.isEmpty()) {
            fillBelt(context, rv, R.id.m_flip1, java.util.Collections.singletonList("아직 득점이 없어요"), false);
            rv.setViewVisibility(R.id.m_belt2, View.GONE);
        } else {
            rv.setViewVisibility(R.id.m_belt2, View.VISIBLE);
            fillBelt(context, rv, R.id.m_flip1, mine, true);
            fillBelt(context, rv, R.id.m_flip2, theirs, true);
            rv.setViewVisibility(R.id.m_belt1, mine.isEmpty() ? View.INVISIBLE : View.VISIBLE);
            rv.setViewVisibility(R.id.m_belt2, theirs.isEmpty() ? View.INVISIBLE : View.VISIBLE);
        }
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 10));
        return rv;
    }

    private static RemoteViews squareLive(Context context, WidgetModel.Live live, long now, Map<String, Bitmap> logos) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_square_live);
        Header header = header(live, now);
        rv.setImageViewResource(R.id.s_dot, dot(header, live));
        rv.setTextViewText(R.id.s_head, header.shortText);
        clock(rv, R.id.s_clock, header);
        logo(rv, R.id.s_logo1, logos.get(live.teamLogoUrl));
        logo(rv, R.id.s_logo2, logos.get(live.opponentLogoUrl));
        rv.setTextViewText(R.id.s_name1, live.teamName);
        rv.setTextViewText(R.id.s_name2, live.opponentName == null ? "상대팀" : live.opponentName);
        rv.setTextViewText(R.id.s_score1, live.scoreVisible() ? String.valueOf(live.mine) : "–");
        rv.setTextViewText(R.id.s_score2, live.scoreVisible() ? String.valueOf(live.opponent) : "–");
        List<String> all = new ArrayList<>();
        for (WidgetModel.Scorer s : live.scorers) all.add(WidgetFormat.scorerLine(s));
        fillBelt(context, rv, R.id.s_flip, all.isEmpty() ? java.util.Collections.singletonList("아직 득점이 없어요") : all, !all.isEmpty());
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 11));
        return rv;
    }

    /** 윗줄 글자와 시계. 시계(Chronometer)는 위젯이 갱신 사이에도 스스로 올라간다. */
    private static final class Header {
        String text;
        String shortText;
        boolean amber;
        /** 시계를 켜면 그 기준 시각(SystemClock.elapsedRealtime 기준), 아니면 -1. */
        long clockBase = -1;
    }

    private static Header header(WidgetModel.Live live, long now) {
        Header h = new Header();
        String league = live.competitionName == null ? "" : " " + live.competitionName;
        WidgetModel.Period p = live.period;
        if ("ENDED".equals(live.state)) {
            String penalties = live.hasPenalties ? "승부차기 " + live.penaltyMine + ":" + live.penaltyOpponent : null;
            h.text = "종료" + league + (penalties == null ? "" : " · " + penalties);
            h.shortText = penalties == null ? "종료" : "종료 · PK " + live.penaltyMine + ":" + live.penaltyOpponent;
        } else if (p != null && "HALFTIME".equals(p.phase)) {
            h.amber = true;
            h.text = "하프타임" + league + " · 휴식";
            h.shortText = "하프타임";
            if (p.restStartedAtMs >= 0) h.clockBase = SystemClock.elapsedRealtime() - Math.max(0, now - p.restStartedAtMs);
        } else if ("PAUSED".equals(live.state) || (p != null && "PAUSED".equals(p.phase))) {
            h.amber = true;
            long elapsed = WidgetFormat.elapsedMs(p, now);
            String when = p == null ? "" : " · " + WidgetFormat.periodName(p.number) + (elapsed >= 0 ? " " + WidgetFormat.minuteMark(elapsed) : "");
            h.text = "일시정지" + league + when;
            h.shortText = "일시정지";
        } else {
            long elapsed = WidgetFormat.elapsedMs(p, now);
            h.text = "LIVE" + league + (p == null ? "" : " · " + WidgetFormat.periodName(p.number));
            h.shortText = "LIVE" + (p == null ? "" : " · " + WidgetFormat.periodName(p.number));
            if (elapsed >= 0) h.clockBase = SystemClock.elapsedRealtime() - elapsed;
        }
        return h;
    }

    /** 진행 중은 빨강, 하프타임·일시정지는 주황, 끝난 경기는 흰색 점. */
    private static int dot(Header h, WidgetModel.Live live) {
        if ("ENDED".equals(live.state)) return R.drawable.widget_dot_white;
        return h.amber ? R.drawable.widget_dot_amber : R.drawable.widget_dot_live;
    }

    private static void clock(RemoteViews rv, int id, Header h) {
        if (h.clockBase < 0) {
            rv.setViewVisibility(id, View.GONE);
            return;
        }
        rv.setViewVisibility(id, View.VISIBLE);
        rv.setChronometer(id, h.clockBase, "%s", true);
    }

    /** 득점 띠에 한 줄씩 채운다 — 두 줄 이상이면 ViewFlipper 가 알아서 넘긴다. */
    private static void fillBelt(Context context, RemoteViews rv, int flipperId, List<String> lines, boolean withBall) {
        rv.removeAllViews(flipperId);
        int from = Math.max(0, lines.size() - MAX_BELT_ITEMS);
        for (String line : lines.subList(from, lines.size())) {
            rv.addView(flipperId, beltItem(context, withBall ? "⚽ " + line : line));
        }
    }

    private static RemoteViews beltItem(Context context, String text) {
        RemoteViews item = new RemoteViews(context.getPackageName(), R.layout.widget_belt_item);
        item.setTextViewText(R.id.belt_text, text);
        return item;
    }

    // ── 응답 대기 ───────────────────────────────────────────────────────────────

    private static RemoteViews mediumPending(Context context, WidgetModel.Schedule s, long now) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_medium_pending);
        rv.setTextViewText(R.id.p_head, "응답 대기 · " + (s.rsvpDeadlineAtMs > 0 ? WidgetFormat.remaining(s.rsvpDeadlineAtMs, now) : "마감 없음"));
        place(context, rv, R.id.p_place_box, R.id.p_place, s.placeName);
        rv.setTextViewText(R.id.p_title, whenAndTitle(s, now));
        // 정원(팀원 수)을 모르면 원을 숨긴다 — 0/0 을 보이지 않게.
        rv.setViewVisibility(R.id.p_ring_box, s.capacity > 0 ? View.VISIBLE : View.GONE);
        rv.setProgressBar(R.id.p_ring, 100, s.capacity > 0 ? Math.min(100, s.goingCount * 100 / s.capacity) : 0, false);
        rv.setTextViewText(R.id.p_count, s.goingCount + "/" + s.capacity);
        rv.setOnClickPendingIntent(R.id.p_yes, respond(context, s.scheduleId, "GOING"));
        rv.setOnClickPendingIntent(R.id.p_no, respond(context, s.scheduleId, "NOT_GOING"));
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 20));
        return rv;
    }

    private static RemoteViews squarePending(Context context, WidgetModel.Schedule s, long now) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_square_pending);
        rv.setTextViewText(R.id.sp_title, whenAndTitle(s, now));
        rv.setTextViewText(R.id.sp_sub, s.rsvpDeadlineAtMs > 0 ? WidgetFormat.remaining(s.rsvpDeadlineAtMs, now) : "마감 없음");
        rv.setOnClickPendingIntent(R.id.sp_yes, respond(context, s.scheduleId, "GOING"));
        rv.setOnClickPendingIntent(R.id.sp_no, respond(context, s.scheduleId, "NOT_GOING"));
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 21));
        return rv;
    }

    // ── 일정 ───────────────────────────────────────────────────────────────────

    private static RemoteViews mediumSchedule(Context context, WidgetPlan plan, long now) {
        WidgetModel.Schedule s = plan.schedule;
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_medium_schedule);
        rv.setTextViewText(R.id.c_day, WidgetFormat.dayWord(s.startAtMs, now));
        place(context, rv, R.id.c_place_box, R.id.c_place, s.placeName);
        rv.setTextViewText(R.id.c_time, WidgetFormat.clock(s.startAtMs));
        rv.setTextViewText(R.id.c_title, s.opponentName != null ? "vs " + s.opponentName : s.title);
        String sub = scheduleSub(s);
        rv.setTextViewText(R.id.c_sub, sub == null ? "" : sub);
        rv.setViewVisibility(R.id.c_sub, sub == null ? View.GONE : View.VISIBLE);
        WidgetModel.Schedule next = plan.tomorrow;
        rv.setViewVisibility(R.id.c_divider, next == null ? View.GONE : View.VISIBLE);
        rv.setViewVisibility(R.id.c_next, next == null ? View.GONE : View.VISIBLE);
        if (next != null) {
            rv.setTextViewText(R.id.c_next, WidgetFormat.dayWord(next.startAtMs, now) + " " + WidgetFormat.clock(next.startAtMs) + " " + (next.opponentName != null ? "vs " + next.opponentName : next.title));
        }
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 30));
        return rv;
    }

    private static RemoteViews squareSchedule(Context context, WidgetModel.Schedule s, long now) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_square_schedule);
        rv.setTextViewText(R.id.sc_day, WidgetFormat.dayWord(s.startAtMs, now));
        rv.setTextViewText(R.id.sc_time, WidgetFormat.clock(s.startAtMs));
        rv.setTextViewText(R.id.sc_title, s.opponentName != null ? "vs " + s.opponentName : s.title);
        String sub = scheduleSub(s);
        rv.setTextViewText(R.id.sc_league, sub == null ? "" : sub);
        place(context, rv, R.id.sc_place_box, R.id.sc_place, s.placeName);
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 31));
        return rv;
    }

    /** 경기는 리그·대회 이름, 훈련·모임은 참석 인원. */
    private static String scheduleSub(WidgetModel.Schedule s) {
        if (s.competitionName != null) return s.competitionName;
        return s.capacity > 0 ? s.goingCount + "/" + s.capacity + "명 참석" : null;
    }

    // ── 아무것도 없음 ───────────────────────────────────────────────────────────

    private static RemoteViews mediumEmpty(Context context, WidgetPlan plan) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_medium_empty);
        rv.setTextViewText(R.id.e_team, plan.lastResult == null ? "팀밋" : plan.lastResult.teamName);
        rv.setTextViewText(R.id.e_last, plan.lastResult == null ? "" : lastResultText(plan.lastResult));
        rv.setViewVisibility(R.id.e_last, plan.lastResult == null ? View.INVISIBLE : View.VISIBLE);
        rv.setOnClickPendingIntent(R.id.e_find, openApp(context, "/matches", 41));
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 40));
        return rv;
    }

    private static RemoteViews squareEmpty(Context context, WidgetPlan plan) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_square_empty);
        rv.setTextViewText(R.id.se_team, plan.lastResult == null ? "팀밋" : plan.lastResult.teamName);
        rv.setTextViewText(R.id.se_last, plan.lastResult == null ? "" : lastResultText(plan.lastResult));
        rv.setOnClickPendingIntent(R.id.w_root, openApp(context, null, 42));
        return rv;
    }

    private static String lastResultText(WidgetModel.LastResult r) {
        String word = "WIN".equals(r.result) ? "승" : "LOSE".equals(r.result) ? "패" : "무";
        return "지난 경기 " + r.mine + ":" + r.opponent + " (" + word + ")";
    }

    // ── 공통 ───────────────────────────────────────────────────────────────────

    private static String whenAndTitle(WidgetModel.Schedule s, long now) {
        String day = WidgetFormat.dayWord(s.startAtMs, now);
        return ("오늘".equals(day) ? "" : day + " ") + WidgetFormat.clock(s.startAtMs) + " " + s.title;
    }

    private static void logo(RemoteViews rv, int id, Bitmap bitmap) {
        if (bitmap == null) {
            rv.setViewVisibility(id, View.INVISIBLE);
            return;
        }
        rv.setViewVisibility(id, View.VISIBLE);
        rv.setImageViewBitmap(id, bitmap);
    }

    /** 장소가 있으면 📍 장소를 보이고, 누르면 지도 앱으로 연결한다. 없으면 통째로 숨긴다. */
    private static void place(Context context, RemoteViews rv, int boxId, int textId, String placeName) {
        if (placeName == null) {
            rv.setViewVisibility(boxId, View.GONE);
            return;
        }
        rv.setViewVisibility(boxId, View.VISIBLE);
        rv.setTextViewText(textId, placeName);
        Intent map = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(placeName)));
        rv.setOnClickPendingIntent(boxId, PendingIntent.getActivity(context, placeName.hashCode(), map, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    static PendingIntent openApp(Context context, String route, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (route != null) intent.putExtra(TeameetMessagingService.EXTRA_ROUTE, route);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent respond(Context context, String scheduleId, String status) {
        Intent intent = new Intent(context, WidgetActionReceiver.class).setAction(ACTION_RESPOND).putExtra(EXTRA_SCHEDULE_ID, scheduleId).putExtra(EXTRA_STATUS, status);
        return PendingIntent.getBroadcast(context, (scheduleId + status).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
