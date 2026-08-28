package kr.co.teameet;

import android.content.Context;
import java.util.UUID;

final class InstallationIdentity {
    private static final String PREFERENCES = "teameet_native";
    private static final String INSTALLATION_ID = "installation_id";
    private static final String FCM_TOKEN = "fcm_token";
    private static final String PUSH_REGISTERED = "push_registered";
    private static final String PUSH_PERMISSION_REQUESTED = "push_permission_requested";

    private InstallationIdentity() {}

    static String installationId(Context context) {
        var preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        String existing = preferences.getString(INSTALLATION_ID, null);
        if (existing != null) return existing;
        String created = UUID.randomUUID().toString();
        preferences.edit().putString(INSTALLATION_ID, created).apply();
        return created;
    }

    static void saveToken(Context context, String token) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putString(FCM_TOKEN, token).apply();
    }

    static String token(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(FCM_TOKEN, null);
    }

    static void markRegistered(Context context, boolean registered) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putBoolean(PUSH_REGISTERED, registered).apply();
    }

    static boolean isRegistered(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(PUSH_REGISTERED, false);
    }

    static void markPermissionRequested(Context context) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putBoolean(PUSH_PERMISSION_REQUESTED, true).apply();
    }

    static boolean wasPermissionRequested(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(PUSH_PERMISSION_REQUESTED, false);
    }
}
