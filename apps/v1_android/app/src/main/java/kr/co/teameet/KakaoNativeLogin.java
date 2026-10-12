package kr.co.teameet;

import android.content.Context;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import com.kakao.sdk.user.UserApiClient;
import java.util.List;
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

    static void start(Context context, List<String> scopes, Callback callback) {
        UserApiClient client = UserApiClient.Companion.getInstance();
        if (client.isKakaoTalkLoginAvailable(context)) {
            // Java sees no Kotlin default arguments, so every parameter is spelled out.
            client.loginWithKakaoTalk(context, 10012, null, null, null, (token, error) -> {
                if (error != null && KakaoLoginPolicy.shouldFallBackToAccountLogin(isCancelled(error))) {
                    loginWithAccount(context, scopes, callback);
                } else {
                    finishWithScopes(context, scopes, token, error, callback);
                }
                return Unit.INSTANCE;
            });
        } else {
            loginWithAccount(context, scopes, callback);
        }
    }

    private static void loginWithAccount(Context context, List<String> scopes, Callback callback) {
        UserApiClient.Companion.getInstance().loginWithKakaoAccount(
            context, null, null, null, null,
            (Function2<OAuthToken, Throwable, Unit>) (token, error) -> {
                finishWithScopes(context, scopes, token, error, callback);
                return Unit.INSTANCE;
            });
    }

    private static void finishWithScopes(Context context, List<String> scopes, OAuthToken token,
                                         Throwable error, Callback callback) {
        if (error != null || token == null) {
            finish(token, error, callback);
            return;
        }
        List<String> missing = KakaoLoginPolicy.additionalScopes(scopes, token.getScopes());
        if (missing.isEmpty()) {
            finish(token, null, callback);
            return;
        }
        // Ask once for the same optional scopes as the web. A declined optional item must
        // not loop or prevent a successful token from being exchanged at our API.
        UserApiClient.Companion.getInstance().loginWithNewScopes(context, missing, null, (next, failure) -> {
            finish(next, failure, callback);
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
