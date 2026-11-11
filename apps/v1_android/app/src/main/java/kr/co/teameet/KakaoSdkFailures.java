package kr.co.teameet;

import com.kakao.sdk.common.model.ApiError;
import com.kakao.sdk.common.model.AuthError;
import com.kakao.sdk.common.model.AuthErrorCause;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import java.util.Objects;

/** Reads Kakao SDK error types so the login flow and {@link KakaoLoginFailure} do not have to. */
final class KakaoSdkFailures {
    private KakaoSdkFailures() {}

    /**
     * The reader closed the login or declined consent. {@code access_denied} is how Kakao reports a
     * refused consent screen, and the SDK itself maps it to {@code Cancelled} for the KakaoTalk hand-off.
     */
    static boolean isDeclined(Throwable error) {
        if (error instanceof ClientError) return ((ClientError) error).getReason() == ClientErrorCause.Cancelled;
        if (error instanceof AuthError) return ((AuthError) error).getReason() == AuthErrorCause.AccessDenied;
        return false;
    }

    /** The failure of one step, or null when the step produced a usable access token. */
    static KakaoLoginFailure failureOf(KakaoLoginFailure.Step step, String accessToken, Throwable error) {
        if (error != null) return summarize(step, error);
        if (accessToken == null || accessToken.isEmpty()) {
            return new KakaoLoginFailure(step, "Other", "MissingAccessToken", null);
        }
        return null;
    }

    private static KakaoLoginFailure summarize(KakaoLoginFailure.Step step, Throwable error) {
        if (error instanceof ClientError) {
            ClientError client = (ClientError) error;
            return new KakaoLoginFailure(step, "ClientFailed", client.getReason().name(), client.getMsg());
        }
        if (error instanceof AuthError) {
            AuthError auth = (AuthError) error;
            return new KakaoLoginFailure(step, "AuthFailed", auth.getReason().name(), auth.getMsg());
        }
        if (error instanceof ApiError) {
            ApiError api = (ApiError) error;
            String detail = api.getResponse().getCode() + " " + Objects.toString(api.getMsg(), "");
            return new KakaoLoginFailure(step, "ApiFailed", api.getReason().name(), detail);
        }
        String type = error.getClass().getSimpleName();
        return new KakaoLoginFailure(step, "Other", type.isEmpty() ? error.getClass().getName() : type,
            error.getMessage());
    }
}
