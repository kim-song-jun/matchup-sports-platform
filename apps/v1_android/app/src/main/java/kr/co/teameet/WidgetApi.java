package kr.co.teameet;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

/** 위젯이 쓰는 API 호출. 토큰 발급만 로그인 쿠키로, 나머지는 위젯 토큰(Bearer)으로 한다. */
final class WidgetApi {
    /** 토큰이 틀리거나 폐기됨 — 다시 로그인해야 한다. */
    static final class Unauthorized extends IOException {
        Unauthorized() {
            super("widget token rejected");
        }
    }

    private static final int TIMEOUT_MS = 10_000;
    /** 마크는 없어도 위젯이 그려지니 짧게 — 위젯 갱신은 리시버 제한 시간 안에 끝나야 한다. */
    private static final int LOGO_TIMEOUT_MS = 4_000;
    private static final int MAX_LOGO_BYTES = 512 * 1024;

    private WidgetApi() {}

    /** 로그인 쿠키로 위젯 토큰을 받는다(기기마다 하나). */
    static String issueToken(String cookie) throws IOException {
        HttpURLConnection c = open("POST", "/api/v1/me/widget-token");
        try {
            c.setRequestProperty("Cookie", cookie);
            c.setRequestProperty("Origin", BuildConfig.WEB_ORIGIN);
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            try (OutputStream out = c.getOutputStream()) {
                out.write("{}".getBytes(StandardCharsets.UTF_8));
            }
            String body = readBody(c);
            try {
                String token = new JSONObject(body).getJSONObject("data").getString("token");
                if (token.isBlank()) throw new IOException("empty widget token");
                return token;
            } catch (JSONException e) {
                throw new IOException("unexpected token response", e);
            }
        } finally {
            c.disconnect();
        }
    }

    static String home(String token) throws IOException {
        HttpURLConnection c = open("GET", "/api/v1/widget/home");
        try {
            c.setRequestProperty("Authorization", "Bearer " + token);
            return readBody(c);
        } finally {
            c.disconnect();
        }
    }

    /**
     * 참석·불참을 저장하고 서버가 실제로 저장한 상태를 돌려준다(정원이 차면 GOING 요청이 WAITLISTED 로 저장된다).
     * 마감 같은 서버 거절은 null.
     */
    static String respond(String token, String scheduleId, String status) throws IOException {
        HttpURLConnection c = open("PUT", "/api/v1/widget/schedules/" + java.net.URLEncoder.encode(scheduleId, "UTF-8") + "/attendance");
        try {
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            try (OutputStream out = c.getOutputStream()) {
                out.write(("{\"status\":\"" + status + "\"}").getBytes(StandardCharsets.UTF_8));
            }
            int code = c.getResponseCode();
            if (code == 401) throw new Unauthorized();
            if (code < 200 || code >= 300) return null;
            return savedStatus(readBody(c), status);
        } finally {
            c.disconnect();
        }
    }

    /** 응답 본문의 `status`. 읽을 수 없으면 요청한 상태를 그대로 쓴다. */
    static String savedStatus(String body, String requested) {
        try {
            JSONObject root = new JSONObject(body);
            JSONObject data = root.optJSONObject("data");
            String saved = (data != null ? data : root).optString("status", "");
            return saved.isEmpty() ? requested : saved;
        } catch (JSONException e) {
            return requested;
        }
    }

    /** 로그아웃할 때 이 기기의 토큰을 폐기한다. 실패해도 로컬 값은 지운다. */
    static void revoke(String token) {
        HttpURLConnection c = null;
        try {
            c = open("DELETE", "/api/v1/widget/token");
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.getResponseCode();
        } catch (IOException ignored) {
            // 서버가 못 받아도 위젯은 이미 토큰을 지웠다. 남은 토큰은 서버의 기기 수 제한이 오래된 것부터 정리한다.
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** 팀 마크 이미지. 사이트 기준 경로는 우리 도메인을 붙이고, 그 밖에는 https 주소만 받는다. */
    static byte[] logo(String url) throws IOException {
        String absolute = url.startsWith("/") ? BuildConfig.WEB_ORIGIN + url : url;
        if (!absolute.startsWith("https://")) throw new IOException("logo must be https");
        HttpURLConnection c = (HttpURLConnection) new URL(absolute).openConnection();
        try {
            c.setConnectTimeout(LOGO_TIMEOUT_MS);
            c.setReadTimeout(LOGO_TIMEOUT_MS);
            if (c.getResponseCode() / 100 != 2) throw new IOException("logo http " + c.getResponseCode());
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                for (int n; (n = in.read(buffer)) > 0; ) {
                    total += n;
                    if (total > MAX_LOGO_BYTES) throw new IOException("logo too large");
                    out.write(buffer, 0, n);
                }
                return out.toByteArray();
            }
        } finally {
            c.disconnect();
        }
    }

    private static HttpURLConnection open(String method, String path) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(BuildConfig.WEB_ORIGIN + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(TIMEOUT_MS);
        c.setReadTimeout(TIMEOUT_MS);
        c.setRequestProperty("Accept", "application/json");
        return c;
    }

    private static String readBody(HttpURLConnection c) throws IOException {
        int code = c.getResponseCode();
        if (code == 401) throw new Unauthorized();
        if (code / 100 != 2) throw new IOException("http " + code);
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
