package kr.co.teameet;

import android.app.Application;

public final class TeameetApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannels.create(this);
        FirebaseBootstrap.initialize(this);
    }
}
