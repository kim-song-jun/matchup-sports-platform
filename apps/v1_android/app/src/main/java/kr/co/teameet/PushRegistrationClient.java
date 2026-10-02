package kr.co.teameet;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

final class PushRegistrationClient {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private PushRegistrationClient() {}

    static void register(Context context) {
        register(context, ignored -> {});
    }

    static void register(Context context, Consumer<Boolean> completion) {
        if (!PushPermission.isGranted(context) || !InstallationIdentity.isOptedIn(context)) {
            completion.accept(false);
            return;
        }
        String token = InstallationIdentity.token(context);
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.WEB_ORIGIN);
        if (token == null || cookie == null || cookie.isBlank()) {
            completion.accept(false);
            return;
        }
        EXECUTOR.execute(() -> {
            boolean registered = postRegistration(context, token, cookie);
            InstallationIdentity.markRegistered(context, registered);
            new Handler(Looper.getMainLooper()).post(() -> completion.accept(registered));
        });
    }

    static void revoke(Context context, Consumer<Boolean> completion) {
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.WEB_ORIGIN);
        if (cookie == null || cookie.isBlank()) {
            completion.accept(false);
            return;
        }
        EXECUTOR.execute(() -> {
            boolean revoked = deleteRegistration(context, cookie);
            if (revoked) InstallationIdentity.markRegistered(context, false);
            new Handler(Looper.getMainLooper()).post(() -> completion.accept(revoked));
        });
    }

    private static boolean postRegistration(Context context, String token, String cookie) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(BuildConfig.WEB_ORIGIN + "/api/v1/notifications/push-devices");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Origin", BuildConfig.WEB_ORIGIN);

            JSONObject body = new JSONObject()
                .put("installationId", InstallationIdentity.installationId(context))
                .put("token", token)
                // Required by the API since iOS gained its own delivery path. The server no
                // longer assumes Android, and a registration without this is rejected.
                .put("platform", "android")
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            int responseCode = connection.getResponseCode();
            return responseCode >= 200 && responseCode < 300;
        } catch (Exception ignored) {
            // Retried on the next authenticated page load or FCM token refresh.
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static boolean deleteRegistration(Context context, String cookie) {
        HttpURLConnection connection = null;
        try {
            String installationId = URLEncoder.encode(
                InstallationIdentity.installationId(context), StandardCharsets.UTF_8.name());
            URL url = new URL(BuildConfig.WEB_ORIGIN
                + "/api/v1/notifications/push-devices/" + installationId);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("DELETE");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Origin", BuildConfig.WEB_ORIGIN);
            int responseCode = connection.getResponseCode();
            return responseCode >= 200 && responseCode < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
