package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.kakao.sdk.common.model.ApiError;
import com.kakao.sdk.common.model.ApiErrorCause;
import com.kakao.sdk.common.model.ApiErrorResponse;
import com.kakao.sdk.common.model.AuthError;
import com.kakao.sdk.common.model.AuthErrorCause;
import com.kakao.sdk.common.model.AuthErrorResponse;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import java.io.IOException;
import java.util.List;
import org.junit.Test;

/** Runs the classification against the SDK's own error classes, so an SDK change that breaks it fails here. */
public final class KakaoSdkFailuresTest {
    private static final KakaoLoginFailure.Step TALK = KakaoLoginFailure.Step.TALK;

    static AuthError authError(AuthErrorCause cause, String description) {
        return new AuthError(400, cause, new AuthErrorResponse(cause.name(), description));
    }

    private static String report(KakaoLoginFailure.Step step, String token, Throwable error) {
        KakaoLoginFailure failure = KakaoSdkFailures.failureOf(step, token, error);
        return KakaoLoginFailure.report(List.of(failure));
    }

    @Test public void aClosedLoginAndARefusedConsentAreBothDeclines() {
        assertTrue(KakaoSdkFailures.isDeclined(new ClientError(ClientErrorCause.Cancelled, "User canceled login")));
        assertTrue(KakaoSdkFailures.isDeclined(authError(AuthErrorCause.AccessDenied, "User denied access")));
    }

    @Test public void everyOtherFailureIsNotADecline() {
        assertFalse(KakaoSdkFailures.isDeclined(null));
        assertFalse(KakaoSdkFailures.isDeclined(new ClientError(ClientErrorCause.NotSupported, "x")));
        assertFalse(KakaoSdkFailures.isDeclined(new ClientError(ClientErrorCause.Unknown, "x")));
        assertFalse(KakaoSdkFailures.isDeclined(authError(AuthErrorCause.InvalidGrant, "x")));
        assertFalse(KakaoSdkFailures.isDeclined(authError(AuthErrorCause.ConsentRequired, "x")));
        assertFalse(KakaoSdkFailures.isDeclined(new ApiError(403, ApiErrorCause.PermissionDenied,
            new ApiErrorResponse(-402, "access_denied", "", "", List.of(), List.of()))));
        assertFalse(KakaoSdkFailures.isDeclined(new IllegalStateException("access_denied")));
    }

    @Test public void aUsableTokenIsNoFailure() {
        assertNull(KakaoSdkFailures.failureOf(TALK, "access-token", null));
    }

    @Test public void aMissingOrEmptyTokenHasItsOwnReason() {
        assertEquals("talk:Other/MissingAccessToken", report(TALK, null, null));
        assertEquals("account:Other/MissingAccessToken",
            report(KakaoLoginFailure.Step.ACCOUNT, "", null));
    }

    @Test public void clientErrorsNameTheirCauseAndMessage() {
        assertEquals("talk:ClientFailed/NotSupported | talk: KakaoTalk is not installed",
            report(TALK, null, new ClientError(ClientErrorCause.NotSupported, "KakaoTalk is not installed")));
    }

    @Test public void authErrorsNameTheirCauseAndDescription() {
        assertEquals("account:AuthFailed/ServerError | account: temporarily unavailable",
            report(KakaoLoginFailure.Step.ACCOUNT, null,
                authError(AuthErrorCause.ServerError, "temporarily unavailable")));
    }

    @Test public void apiErrorsNameTheirCauseCodeAndMessage() {
        ApiError error = new ApiError(401, ApiErrorCause.InvalidToken,
            new ApiErrorResponse(-401, "this access token does not exist", "", "", List.of(), List.of()));

        assertEquals("consent:ApiFailed/InvalidToken | consent: -401 this access token does not exist",
            report(KakaoLoginFailure.Step.CONSENT, null, error));
    }

    @Test public void nonSdkErrorsNameTheirTypeAndMessage() {
        assertEquals("talk:Other/IOException | talk: unexpected end of stream",
            report(TALK, null, new IOException("unexpected end of stream")));
    }

    @Test public void sdkMessagesThatEchoSecretsAreRedactedBeforeTheyLeave() {
        String message = "redirect failed kakao0123abcd://oauth?code=SECRETCODE&state=xyz";
        String report = report(TALK, null, new ClientError(ClientErrorCause.Unknown, message));

        assertFalse(report, report.contains("SECRETCODE"));
        assertFalse(report, report.contains("kakao0123abcd"));
        assertTrue(report, report.startsWith("talk:ClientFailed/Unknown | talk: redirect failed"));
    }
}
