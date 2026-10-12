package kr.co.teameet;

import android.app.Application;
import com.google.firebase.messaging.FirebaseMessaging;
import com.kakao.sdk.common.KakaoSdk;

public final class TeameetApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannels.create(this);
        // KakaoSdk.init throws on an empty key, so builds without one skip it entirely.
        if (KakaoLoginPolicy.isEnabled(BuildConfig.KAKAO_NATIVE_APP_KEY)) {
            KakaoSdk.init(this, BuildConfig.KAKAO_NATIVE_APP_KEY);
        }
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
