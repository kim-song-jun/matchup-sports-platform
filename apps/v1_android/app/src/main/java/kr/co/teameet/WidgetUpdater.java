package kr.co.teameet;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 위젯을 새로 그린다 — 서버에서 받고(또는 캐시), 화면을 정하고, 팀 마크를 받아 두 위젯(중간·정사각형)을 모두 갱신한다.
 * 모든 일은 한 줄(단일 스레드)로 흘려 보내 갱신이 서로 겹치지 않게 한다.
 */
final class WidgetUpdater {
    static final String ACTION_REFRESH = "kr.co.teameet.widget.REFRESH";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    /** 경기가 진행 중이면 이 간격으로 다시 받는다(시스템이 정하는 30분 갱신과 별개). 앱이 FCM 으로 깨워 주면 더 빠르다. */
    private static final long LIVE_REFRESH_MS = 60_000;
    /** 네트워크가 안 될 때 마지막 화면을 이 시간까지만 보여 준다 — 오래된 점수를 지금처럼 보이지 않게. */
    private static final long STALE_AFTER_MS = 3 * 60 * 60 * 1_000L;
    private static final long ISSUE_RETRY_MS = 10 * 60 * 1_000L;

    private WidgetUpdater() {}

    static void refresh(Context context, Runnable done) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                refreshNow(app);
            } finally {
                if (done != null) done.run();
            }
        });
    }

    /** 위젯 크기를 바꿨을 때처럼 서버 호출 없이 마지막 데이터로 다시 그린다. */
    static void renderCached(Context context, Runnable done) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                String json = WidgetTokenStore.cachedJson(app);
                if (json != null) renderJson(app, json, System.currentTimeMillis());
            } finally {
                if (done != null) done.run();
            }
        });
    }

    /** 웹 화면이 한 장 열릴 때마다 — 로그인돼 있으면 토큰을 받아 두고, 로그아웃했으면 토큰을 폐기한다. */
    static void onWebPageFinished(Context context, String cookie) {
        Context app = context.getApplicationContext();
        boolean loggedIn = cookie != null && cookie.contains("teameet_v1_session=");
        EXECUTOR.execute(() -> {
            long now = System.currentTimeMillis();
            String token = WidgetTokenStore.token(app);
            if (!loggedIn) {
                if (token != null) {
                    WidgetApi.revoke(token);
                    WidgetTokenStore.clear(app);
                    renderMessage(app, app.getString(R.string.widget_login_title), app.getString(R.string.widget_login_sub));
                    cancelLiveAlarm(app);
                }
                return;
            }
            if (token == null) {
                if (WidgetTokenStore.issueAttemptedWithin(app, now, ISSUE_RETRY_MS)) return;
                WidgetTokenStore.markIssueAttempt(app, now);
                try {
                    WidgetTokenStore.saveToken(app, WidgetApi.issueToken(cookie));
                } catch (Exception ignored) {
                    return; // 다음 화면에서 다시(10분에 한 번까지).
                }
            } else if (WidgetTokenStore.refreshedWithin(app, now, 60_000)) {
                return;
            }
            refreshNow(app);
        });
    }

    private static void refreshNow(Context context) {
        if (!hasWidgets(context)) {
            cancelLiveAlarm(context);
            return;
        }
        long now = System.currentTimeMillis();
        String token = WidgetTokenStore.token(context);
        if (token == null) {
            renderMessage(context, context.getString(R.string.widget_login_title), context.getString(R.string.widget_login_sub));
            cancelLiveAlarm(context);
            return;
        }
        try {
            String json = WidgetApi.home(token);
            WidgetTokenStore.cache(context, json, now);
            WidgetTokenStore.markRefresh(context, now);
            renderJson(context, json, now);
        } catch (WidgetApi.Unauthorized e) {
            WidgetTokenStore.clear(context);
            renderMessage(context, context.getString(R.string.widget_login_title), context.getString(R.string.widget_login_sub));
            cancelLiveAlarm(context);
        } catch (Exception e) {
            String cached = WidgetTokenStore.cachedJson(context);
            if (cached != null && now - WidgetTokenStore.cachedAt(context) < STALE_AFTER_MS) {
                renderJson(context, cached, now);
            } else {
                renderMessage(context, context.getString(R.string.widget_error_title), context.getString(R.string.widget_error_sub));
            }
        }
    }

    private static void renderJson(Context context, String json, long now) {
        try {
            WidgetModel model = WidgetModel.parse(json);
            WidgetPlan plan = WidgetPlan.of(model, now);
            // 받아 둔 마크로 먼저 그리고, 없는 마크는 그 뒤에 받아 한 번 더 그린다 — 느린 망에서도 화면은 먼저 바뀐다.
            Map<String, Bitmap> logos = new HashMap<>();
            List<String> missing = new ArrayList<>();
            if (plan.kind == WidgetPlan.Kind.LIVE) {
                for (String url : new String[] {plan.live.teamLogoUrl, plan.live.opponentLogoUrl}) {
                    if (url == null || logos.containsKey(url)) continue;
                    Bitmap saved = WidgetLogos.cached(context, url);
                    logos.put(url, saved);
                    if (saved == null) missing.add(url);
                }
            }
            draw(context, plan, now, logos);
            boolean fetched = false;
            for (String url : missing) {
                Bitmap bitmap = WidgetLogos.load(context, url);
                if (bitmap != null) {
                    logos.put(url, bitmap);
                    fetched = true;
                }
            }
            if (fetched) draw(context, plan, now, logos);
            if (plan.kind == WidgetPlan.Kind.LIVE && !"ENDED".equals(plan.live.state)) scheduleLiveAlarm(context, now);
            else cancelLiveAlarm(context);
        } catch (Exception e) {
            renderMessage(context, context.getString(R.string.widget_error_title), context.getString(R.string.widget_error_sub));
        }
    }

    private static void draw(Context context, WidgetPlan plan, long now, Map<String, Bitmap> logos) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : ids(context, TeameetWidgetProvider.class)) manager.updateAppWidget(id, WidgetRenderer.medium(context, plan, now, logos));
        for (int id : ids(context, TeameetSquareWidgetProvider.class)) manager.updateAppWidget(id, WidgetRenderer.square(context, plan, now, logos));
    }

    private static void renderMessage(Context context, String title, String sub) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        RemoteViews views = WidgetRenderer.message(context, title, sub);
        for (int id : ids(context, TeameetWidgetProvider.class)) manager.updateAppWidget(id, views);
        for (int id : ids(context, TeameetSquareWidgetProvider.class)) manager.updateAppWidget(id, views);
    }

    private static boolean hasWidgets(Context context) {
        return ids(context, TeameetWidgetProvider.class).length + ids(context, TeameetSquareWidgetProvider.class).length > 0;
    }

    private static int[] ids(Context context, Class<?> provider) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, provider));
    }

    private static PendingIntent liveAlarm(Context context) {
        Intent intent = new Intent(context, WidgetActionReceiver.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, 7, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 경기 중에는 1분 뒤 한 번 더 — 정확한 시각이 아니어도 되는 `set` 이라 별도 권한이 필요 없다. */
    private static void scheduleLiveAlarm(Context context, long now) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.set(AlarmManager.RTC, now + LIVE_REFRESH_MS, liveAlarm(context));
    }

    private static void cancelLiveAlarm(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(liveAlarm(context));
    }
}
