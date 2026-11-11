package kr.co.teameet;

import static org.junit.Assert.assertEquals;

import com.kakao.sdk.auth.model.OAuthToken;
import com.kakao.sdk.common.model.AuthErrorCause;
import com.kakao.sdk.common.model.ClientError;
import com.kakao.sdk.common.model.ClientErrorCause;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import org.junit.Test;

/** Drives the whole login flow with scripted SDK replies. */
public final class KakaoNativeLoginTest {
    private static final List<String> WANTED = List.of("name", "phone_number");

    /** One scripted SDK reply: a token, an error, or neither. */
    private static final class Reply {
        final OAuthToken token;
        final Throwable error;

        Reply(OAuthToken token, Throwable error) {
            this.token = token;
            this.error = error;
        }

        static Reply token(String accessToken, String... scopes) {
            return new Reply(new OAuthToken(accessToken, new Date(0), "refresh", new Date(0), null,
                List.of(scopes)), null);
        }

        static Reply error(Throwable error) {
            return new Reply(null, error);
        }

        static Reply nothing() {
            return new Reply(null, null);
        }
    }

    private static final class ScriptedSdk implements KakaoNativeLogin.Sdk {
        final List<String> calls = new ArrayList<>();
        final List<String> consentScopes = new ArrayList<>();
        boolean talkInstalled;
        Reply talk;
        Reply account;
        Reply consent;

        @Override public boolean isTalkAvailable() {
            return talkInstalled;
        }

        @Override public void loginWithTalk(Result result) {
            calls.add("talk");
            result.accept(talk.token, talk.error);
        }

        @Override public void loginWithAccount(Result result) {
            calls.add("account");
            result.accept(account.token, account.error);
        }

        @Override public void loginWithNewScopes(List<String> scopes, Result result) {
            calls.add("consent");
            consentScopes.addAll(scopes);
            result.accept(consent.token, consent.error);
        }
    }

    private static final class Outcomes implements KakaoNativeLogin.Callback {
        final List<String> events = new ArrayList<>();

        @Override public void onSuccess(String accessToken) {
            events.add("success:" + accessToken);
        }

        @Override public void onCancelled() {
            events.add("cancelled");
        }

        @Override public void onError(String reason) {
            events.add("error:" + reason);
        }
    }

    private static ScriptedSdk withTalk(Reply talk) {
        ScriptedSdk sdk = new ScriptedSdk();
        sdk.talkInstalled = true;
        sdk.talk = talk;
        return sdk;
    }

    private static ScriptedSdk withoutTalk(Reply account) {
        ScriptedSdk sdk = new ScriptedSdk();
        sdk.account = account;
        return sdk;
    }

    private static Outcomes run(ScriptedSdk sdk) {
        Outcomes outcomes = new Outcomes();
        KakaoNativeLogin.run(sdk, WANTED, outcomes);
        return outcomes;
    }

    private static Reply talkNotSupported() {
        return Reply.error(new ClientError(ClientErrorCause.NotSupported, "KakaoTalk launch failed."));
    }

    private static Reply accessDenied() {
        return Reply.error(KakaoSdkFailuresTest.authError(AuthErrorCause.AccessDenied, "User denied access"));
    }

    @Test public void kakaoTalkSuccessNeedsNoFallbackOrConsent() {
        ScriptedSdk sdk = withTalk(Reply.token("talk-token", "name", "phone_number"));

        assertEquals(List.of("success:talk-token"), run(sdk).events);
        assertEquals(List.of("talk"), sdk.calls);
    }

    @Test public void withoutKakaoTalkTheAccountPageIsUsed() {
        ScriptedSdk sdk = withoutTalk(Reply.token("account-token", "name", "phone_number"));

        assertEquals(List.of("success:account-token"), run(sdk).events);
        assertEquals(List.of("account"), sdk.calls);
    }

    @Test public void anUnusableKakaoTalkFallsBackToTheAccountPage() {
        ScriptedSdk sdk = withTalk(talkNotSupported());
        sdk.account = Reply.token("account-token", "name", "phone_number");

        assertEquals(List.of("success:account-token"), run(sdk).events);
        assertEquals(List.of("talk", "account"), sdk.calls);
    }

    @Test public void whenBothStepsFailTheReportNamesBothWithTheTalkFailureFirst() {
        ScriptedSdk sdk = withTalk(talkNotSupported());
        sdk.account = Reply.error(KakaoSdkFailuresTest.authError(AuthErrorCause.ServerError, "try again later"));

        assertEquals(List.of("error:talk:ClientFailed/NotSupported account:AuthFailed/ServerError"
            + " | talk: KakaoTalk launch failed. | account: try again later"), run(sdk).events);
    }

    @Test public void aKakaoTalkReplyWithoutATokenIsAFailureThatFallsBack() {
        ScriptedSdk sdk = withTalk(Reply.nothing());
        sdk.account = Reply.nothing();

        assertEquals(List.of("error:talk:Other/MissingAccessToken account:Other/MissingAccessToken"),
            run(sdk).events);
        assertEquals(List.of("talk", "account"), sdk.calls);
    }

    @Test public void aClosedKakaoTalkLoginEndsTheFlowWithoutTheAccountPage() {
        ScriptedSdk sdk = withTalk(Reply.error(new ClientError(ClientErrorCause.Cancelled, "User canceled login")));

        assertEquals(List.of("cancelled"), run(sdk).events);
        assertEquals(List.of("talk"), sdk.calls);
    }

    @Test public void aConsentRefusedInKakaoTalkEndsTheFlowWithoutTheAccountPage() {
        ScriptedSdk sdk = withTalk(accessDenied());

        assertEquals(List.of("cancelled"), run(sdk).events);
        assertEquals(List.of("talk"), sdk.calls);
    }

    @Test public void aConsentRefusedOnTheAccountPageIsACancelNotAnError() {
        ScriptedSdk viaFallback = withTalk(talkNotSupported());
        viaFallback.account = accessDenied();
        ScriptedSdk direct = withoutTalk(accessDenied());

        assertEquals(List.of("cancelled"), run(viaFallback).events);
        assertEquals(List.of("cancelled"), run(direct).events);
    }

    @Test public void onlyTheMissingOptionalScopesAreAskedForAfterSignIn() {
        ScriptedSdk sdk = withoutTalk(Reply.token("account-token", "name"));
        sdk.consent = Reply.token("consented-token", "name", "phone_number");

        assertEquals(List.of("success:consented-token"), run(sdk).events);
        assertEquals(List.of("account", "consent"), sdk.calls);
        assertEquals(List.of("phone_number"), sdk.consentScopes);
    }

    @Test public void aConsentRefusedAtTheScopesPromptIsACancel() {
        ScriptedSdk sdk = withoutTalk(Reply.token("account-token", "name"));
        sdk.consent = accessDenied();

        assertEquals(List.of("cancelled"), run(sdk).events);
    }

    @Test public void aFailedScopesPromptReportsOnlyThatStep() {
        ScriptedSdk sdk = withTalk(talkNotSupported());
        sdk.account = Reply.token("account-token", "name");
        sdk.consent = Reply.error(new ClientError(ClientErrorCause.Unknown, "consent screen crashed"));

        List<String> events = run(sdk).events;

        assertEquals(List.of("error:consent:ClientFailed/Unknown | consent: consent screen crashed"), events);
    }

    @Test public void anEmptyTokenFromTheScopesPromptIsAFailure() {
        ScriptedSdk sdk = withoutTalk(Reply.token("account-token", "name"));
        sdk.consent = Reply.token("", "name", "phone_number");

        assertEquals(List.of("error:consent:Other/MissingAccessToken"), run(sdk).events);
    }
}
