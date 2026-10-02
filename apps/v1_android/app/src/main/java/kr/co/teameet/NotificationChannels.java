package kr.co.teameet;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;

final class NotificationChannels {
    static final String GENERAL = "teameet_general";

    private NotificationChannels() {}

    static void create(Context context) {
        NotificationChannel channel = new NotificationChannel(
            GENERAL,
            context.getString(R.string.notification_channel_general),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.notification_channel_general_description));
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
}
