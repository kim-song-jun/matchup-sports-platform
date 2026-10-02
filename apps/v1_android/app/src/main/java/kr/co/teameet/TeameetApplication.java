package kr.co.teameet;

import android.app.Application;
import com.google.firebase.messaging.FirebaseMessaging;

public final class TeameetApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannels.create(this);
        if (FirebaseBootstrap.initialize(this)) {
            boolean activeConsent = PushDeliveryPolicy.hasActiveConsent(
                PushPermission.isGranted(this),
                InstallationIdentity.isOptedIn(this)
            );
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(activeConsent);
            if (!activeConsent) {
                InstallationIdentity.clearToken(this);
                messaging.deleteToken();
            }
        }
    }
}
