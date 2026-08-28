package kr.co.teameet;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class TeameetMessagingService extends FirebaseMessagingService {
    static final String EXTRA_ROUTE = "teameet_route";

    @Override
    public void onNewToken(String token) {
        InstallationIdentity.saveToken(this, token);
        if (PushPermission.isGranted(this) && InstallationIdentity.isOptedIn(this)) {
            PushRegistrationClient.register(this);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
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
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        getSystemService(NotificationManager.class).notify(notificationId.hashCode(), notification.build());
    }

}
