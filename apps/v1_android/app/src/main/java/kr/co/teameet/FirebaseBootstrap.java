package kr.co.teameet;

import android.content.Context;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

final class FirebaseBootstrap {
    private FirebaseBootstrap() {}

    static boolean initialize(Context context) {
        if (BuildConfig.FIREBASE_APP_ID.isBlank()
            || BuildConfig.FIREBASE_API_KEY.isBlank()
            || BuildConfig.FIREBASE_PROJECT_ID.isBlank()
            || BuildConfig.FIREBASE_SENDER_ID.isBlank()) return false;
        if (FirebaseApp.getApps(context).isEmpty()) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .build();
            FirebaseApp.initializeApp(context, options);
        }
        return true;
    }
}
