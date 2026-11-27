package kr.co.teameet;

import android.content.Context;
import android.content.SharedPreferences;

/** 위젯 토큰(읽기 + 내 참석 응답 저장만 되는 값)과 마지막으로 받은 화면 데이터. 앱 전용 저장소에만 둔다. */
final class WidgetTokenStore {
    private static final String FILE = "teameet_widget";
    private static final String TOKEN = "token";
    private static final String CACHE = "home_json";
    private static final String CACHED_AT = "home_cached_at";
    private static final String LAST_ISSUE_ATTEMPT = "last_issue_attempt";
    private static final String LAST_REFRESH = "last_refresh";

    private WidgetTokenStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String token(Context context) {
        String value = prefs(context).getString(TOKEN, null);
        return value == null || value.isBlank() ? null : value;
    }

    static void saveToken(Context context, String token) {
        prefs(context).edit().putString(TOKEN, token).apply();
    }

    /** 로그아웃·토큰 폐기: 토큰과 캐시를 함께 지워 다른 사람 정보가 위젯에 남지 않게 한다. */
    static void clear(Context context) {
        prefs(context).edit().remove(TOKEN).remove(CACHE).remove(CACHED_AT).apply();
    }

    static void cache(Context context, String json, long nowMs) {
        prefs(context).edit().putString(CACHE, json).putLong(CACHED_AT, nowMs).apply();
    }

    static String cachedJson(Context context) {
        return prefs(context).getString(CACHE, null);
    }

    static long cachedAt(Context context) {
        return prefs(context).getLong(CACHED_AT, 0);
    }

    /** 이 시간 안에 이미 시도했으면 true — 페이지를 넘길 때마다 토큰을 새로 받지 않게. */
    static boolean issueAttemptedWithin(Context context, long nowMs, long windowMs) {
        return nowMs - prefs(context).getLong(LAST_ISSUE_ATTEMPT, 0) < windowMs;
    }

    static void markIssueAttempt(Context context, long nowMs) {
        prefs(context).edit().putLong(LAST_ISSUE_ATTEMPT, nowMs).apply();
    }

    static boolean refreshedWithin(Context context, long nowMs, long windowMs) {
        return nowMs - prefs(context).getLong(LAST_REFRESH, 0) < windowMs;
    }

    static void markRefresh(Context context, long nowMs) {
        prefs(context).edit().putLong(LAST_REFRESH, nowMs).apply();
    }
}
