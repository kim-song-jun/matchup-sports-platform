package kr.co.teameet;

import android.content.Context;
import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.user.UserApiClient;
import java.util.ArrayList;
import java.util.List;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;

/** Runs the Kakao SDK login (KakaoTalk when installed, otherwise the account page) and reports one outcome. */
final class KakaoNativeLogin {
    interface Callback {
        void onSuccess(String accessToken);
        void onCancelled();
        /** A {@link KakaoLoginFailure#report} that names every failed step. */
        void onError(String reason);
    }

    /** The SDK calls the flow makes, so the flow can run without a device. */
    interface Sdk {
        interface Result {
            void accept(OAuthToken token, Throwable error);
        }

        boolean isTalkAvailable();
        void loginWithTalk(Result result);
        void loginWithAccount(Result result);
        void loginWithNewScopes(List<String> scopes, Result result);
    }

    private KakaoNativeLogin() {}

    static void start(Context context, List<String> scopes, Callback callback) {
        run(realSdk(context), scopes, callback);
    }

    static void run(Sdk sdk, List<String> scopes, Callback callback) {
        if (sdk.isTalkAvailable()) {
            sdk.loginWithTalk((token, error) -> onTalkResult(sdk, scopes, token, error, callback));
        } else {
            loginWithAccount(sdk, scopes, List.of(), callback);
        }
    }

    private static void onTalkResult(Sdk sdk, List<String> scopes, OAuthToken token, Throwable error,
                                     Callback callback) {
        if (KakaoSdkFailures.isDeclined(error)) {
            callback.onCancelled();
            return;
        }
        // KakaoTalk installed but unusable (not logged in, hand-off refused): the account page is the fallback.
        KakaoLoginFailure failure = KakaoSdkFailures.failureOf(KakaoLoginFailure.Step.TALK, accessTokenOf(token), error);
        if (failure == null) finishWithScopes(sdk, scopes, token, callback);
        else loginWithAccount(sdk, scopes, List.of(failure), callback);
    }

    private static void loginWithAccount(Sdk sdk, List<String> scopes, List<KakaoLoginFailure> earlier,
                                         Callback callback) {
        sdk.loginWithAccount((token, error) -> {
            OAuthToken usable = usableToken(KakaoLoginFailure.Step.ACCOUNT, token, error, earlier, callback);
            if (usable != null) finishWithScopes(sdk, scopes, usable, callback);
        });
    }

    private static void finishWithScopes(Sdk sdk, List<String> scopes, OAuthToken token, Callback callback) {
        List<String> missing = KakaoLoginPolicy.additionalScopes(scopes, token.getScopes());
        if (missing.isEmpty()) {
            callback.onSuccess(token.getAccessToken());
            return;
        }
        // Ask once for the same optional scopes as the web, never again. Unchecking some items
        // still returns a token and completes; declining the whole prompt is a cancel, as elsewhere.
        sdk.loginWithNewScopes(missing, (next, failure) -> {
            OAuthToken usable = usableToken(KakaoLoginFailure.Step.CONSENT, next, failure, List.of(), callback);
            if (usable != null) callback.onSuccess(usable.getAccessToken());
        });
    }

    /** The token when the step succeeded; otherwise the flow ends here with a cancel or an error and this returns null. */
    private static OAuthToken usableToken(KakaoLoginFailure.Step step, OAuthToken token, Throwable error,
                                          List<KakaoLoginFailure> earlier, Callback callback) {
        if (KakaoSdkFailures.isDeclined(error)) {
            callback.onCancelled();
            return null;
        }
        KakaoLoginFailure failure = KakaoSdkFailures.failureOf(step, accessTokenOf(token), error);
        if (failure == null) return token;
        List<KakaoLoginFailure> failed = new ArrayList<>(earlier);
        failed.add(failure);
        callback.onError(KakaoLoginFailure.report(failed));
        return null;
    }

    private static String accessTokenOf(OAuthToken token) {
        return token == null ? null : token.getAccessToken();
    }

    private static Sdk realSdk(Context context) {
        UserApiClient client = UserApiClient.Companion.getInstance();
        return new Sdk() {
            @Override public boolean isTalkAvailable() {
                return client.isKakaoTalkLoginAvailable(context);
            }

            @Override public void loginWithTalk(Result result) {
                // Java sees no Kotlin default arguments, so every parameter is spelled out.
                client.loginWithKakaoTalk(context, 10012, null, null, null, (token, error) -> {
                    result.accept(token, error);
                    return Unit.INSTANCE;
                });
            }

            @Override public void loginWithAccount(Result result) {
                client.loginWithKakaoAccount(context, null, null, null, null,
                    (Function2<OAuthToken, Throwable, Unit>) (token, error) -> {
                        result.accept(token, error);
                        return Unit.INSTANCE;
                    });
            }

            @Override public void loginWithNewScopes(List<String> scopes, Result result) {
                client.loginWithNewScopes(context, scopes, null, (token, error) -> {
                    result.accept(token, error);
                    return Unit.INSTANCE;
                });
            }
        };
    }
}
