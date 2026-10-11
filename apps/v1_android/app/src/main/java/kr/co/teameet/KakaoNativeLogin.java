package kr.co.teameet;

import android.content.Context;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;

/** Runs the Kakao SDK login (KakaoTalk when installed, otherwise the account page) and reports one outcome. */
final class KakaoNativeLogin {
    interface Callback {
        void onSuccess(String accessToken);
        void onCancelled();
        void onError(String code);
    }

    private KakaoNativeLogin() {}

    static void start(Context context, Callback callback) {
        UserApiClient client = UserApiClient.Companion.getInstance();
        if (client.isKakaoTalkLoginAvailable(context)) {
            // Java sees no Kotlin default arguments, so every parameter is spelled out.
            client.loginWithKakaoTalk(context, 10012, null, null, null, (token, error) -> {
                if (error != null && KakaoLoginPolicy.shouldFallBackToAccountLogin(isCancelled(error))) {
                    loginWithAccount(context, callback);
                } else {
                    finish(token, error, callback);
                }
                return Unit.INSTANCE;
            });
        } else {
            loginWithAccount(context, callback);
        }
    }

    private static void loginWithAccount(Context context, Callback callback) {
        UserApiClient.Companion.getInstance().loginWithKakaoAccount(
            context, null, null, null, null,
            (Function2<OAuthToken, Throwable, Unit>) (token, error) -> {
                finish(token, error, callback);
                return Unit.INSTANCE;
            });
    }

    private static void finish(OAuthToken token, Throwable error, Callback callback) {
        if (error != null) {
            if (isCancelled(error)) callback.onCancelled();
            else callback.onError("kakao-login-failed");
        } else if (token == null || token.getAccessToken().isEmpty()) {
            callback.onError("kakao-login-failed");
        } else {
            callback.onSuccess(token.getAccessToken());
        }
    }

    private static boolean isCancelled(Throwable error) {
        return error instanceof ClientError
            && ((ClientError) error).getReason() == ClientErrorCause.Cancelled;
    }
}
