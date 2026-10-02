package kr.co.teameet;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class TeameetMessagingService extends FirebaseMessagingService {
    static final String EXTRA_ROUTE = "teameet_route";
    private static final String DIAGNOSTIC_TAG = "TeameetFCM";

    @Override
    public void onNewToken(String token) {
        boolean permissionGranted = PushPermission.isGranted(this);
        boolean optedIn = InstallationIdentity.isOptedIn(this);
        if (!PushDeliveryPolicy.hasActiveConsent(permissionGranted, optedIn)) {
            logDiagnostic("token_refresh_skipped permission=" + permissionGranted + " optedIn=" + optedIn);
            return;
        }
        logDiagnostic("token_refreshed registration=starting");
        InstallationIdentity.saveToken(this, token);
        PushRegistrationClient.register(
            this,
            registered -> logDiagnostic("token_registration_completed success=" + registered)
        );
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        boolean permissionGranted = PushPermission.isGranted(this);
        boolean optedIn = InstallationIdentity.isOptedIn(this);
        logDiagnostic("message_received permission=" + permissionGranted + " optedIn=" + optedIn);
        if (!PushDeliveryPolicy.shouldDisplay(permissionGranted, optedIn)) {
            logDiagnostic("message_suppressed reason=inactive_consent");
            return;
        }
        NotificationChannels.create(this);
        String title = message.getNotification() == null ? null : message.getNotification().getTitle();
        String body = message.getNotification() == null ? null : message.getNotification().getBody();
        String route = AllowedNavigation.safeRoute(message.getData().get("route"));
        String notificationId = message.getData().getOrDefault("notificationId", route);
        Intent intent = new Intent(this, MainActivity.class)
            .putExtra(EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            notificationId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, NotificationChannels.GENERAL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.notification_color))
            .setContentTitle(title == null ? getString(R.string.app_name) : title)
            .setContentText(body)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        getSystemService(NotificationManager.class).notify(notificationId.hashCode(), notification.build());
        logDiagnostic("notification_posted channel=" + NotificationChannels.GENERAL);
    }

    private static void logDiagnostic(String event) {
        if (BuildConfig.FCM_DIAGNOSTIC_LOGGING_ENABLED) Log.i(DIAGNOSTIC_TAG, event);
    }
}
