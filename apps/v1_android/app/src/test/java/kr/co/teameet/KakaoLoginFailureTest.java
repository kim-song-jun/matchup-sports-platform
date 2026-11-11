package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

/**
 * What the page logs when native Kakao sign-in fails. The reader never sees it, so it only helps by
 * saying which step failed and why, without leaking what the SDK echoes.
 */
public final class KakaoLoginFailureTest {
    private static final KakaoLoginFailure.Step TALK = KakaoLoginFailure.Step.TALK;
    private static final KakaoLoginFailure.Step ACCOUNT = KakaoLoginFailure.Step.ACCOUNT;
    private static final KakaoLoginFailure.Step CONSENT = KakaoLoginFailure.Step.CONSENT;

    private static KakaoLoginFailure talk(String detail) {
        return new KakaoLoginFailure(TALK, "ClientFailed", "NotSupported", detail);
    }

    @Test public void reportNamesEveryFailedStepBeforeAnyDetail() {
        String report = KakaoLoginFailure.report(List.of(
            new KakaoLoginFailure(TALK, "ClientFailed", "NotSupported", "KakaoTalk launch failed."),
            new KakaoLoginFailure(ACCOUNT, "AuthFailed", "ServerError", "temporarily unavailable")));

        assertEquals("talk:ClientFailed/NotSupported account:AuthFailed/ServerError"
            + " | talk: KakaoTalk launch failed. | account: temporarily unavailable", report);
    }

    @Test public void aStepWithoutDetailLeavesNoDanglingSeparator() {
        assertEquals("consent:Other/MissingAccessToken", KakaoLoginFailure.report(List.of(
            new KakaoLoginFailure(CONSENT, "Other", "MissingAccessToken", null))));
        assertNull(talk("   \n\t ").detail);
    }

    @Test public void reportIsCappedButStillNamesEveryStep() {
        String longDetail = "word ".repeat(100);
        String report = KakaoLoginFailure.report(List.of(
            new KakaoLoginFailure(TALK, "ApiFailed", "ApiLimitExceeded", longDetail),
            new KakaoLoginFailure(ACCOUNT, "ApiFailed", "ApiLimitExceeded", longDetail),
            new KakaoLoginFailure(CONSENT, "ApiFailed", "ApiLimitExceeded", longDetail)));

        assertTrue(report, report.codePointCount(0, report.length()) <= KakaoLoginFailure.REPORT_LIMIT);
        assertTrue(report, report.startsWith("talk:ApiFailed/ApiLimitExceeded account:ApiFailed/ApiLimitExceeded"
            + " consent:ApiFailed/ApiLimitExceeded | talk: word word"));
    }

    @Test public void oneDetailCannotCrowdOutTheRest() {
        KakaoLoginFailure failure = talk("ab ".repeat(400));

        assertEquals(100, failure.detail.codePointCount(0, failure.detail.length()));
        assertTrue(failure.detail.endsWith("…"));
    }

    @Test public void truncationNeverSplitsASurrogatePair() {
        String smiley = new String(Character.toChars(0x1F600));
        String prose = "ab ".repeat(32) + "ab";
        KakaoLoginFailure failure = talk(prose + smiley.repeat(3));

        assertEquals(98, prose.length());
        assertEquals(prose + smiley + "…", failure.detail);
    }

    @Test public void secretsAndUrlsAreRemovedFromDetails() {
        String[][] leaky = {
            {"redirect failed kakao0123abcd://oauth?code=SECRETCODE&state=xyz", "SECRETCODE"},
            {"redirect failed kakao0123abcd://oauth?code=SECRETCODE&state=xyz", "kakao0123abcd"},
            {"bad grant: https://kauth.kakao.com/oauth/token?client_id=APPKEY123", "APPKEY123"},
            {"invalid access_token=abcDEF123456 for user", "abcDEF123456"},
            {"Authorization: Bearer ya29.A0ARrdaM-secretvalue", "secretvalue"},
            {"jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
                "eyJhbGci"},
            {"opaque abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456789 value", "abcdefghijklmnopqrstuvwxyz"},
            {"see /oauth/authorize?client_id=APPKEY123&redirect_uri=x", "APPKEY123"},
        };

        for (String[] item : leaky) {
            String report = KakaoLoginFailure.report(List.of(talk(item[0])));
            assertFalse(item[1] + " leaked in: " + report, report.contains(item[1]));
        }
    }

    @Test public void aSeparatorCharacterCannotHideASecretFromRedaction() {
        String lineSeparator = String.valueOf((char) 0x2028);
        String report = KakaoLoginFailure.report(List.of(talk("https://x.example/cb?code=SECRETCODE"
            + lineSeparator + "access_token=TOPSECRET")));

        assertFalse(report, report.contains("SECRETCODE"));
        assertFalse(report, report.contains("TOPSECRET"));
    }

    /** Redaction must not eat the words that make a report useful. */
    @Test public void ordinaryMessagesSurviveUntouched() {
        KakaoLoginFailure failure = new KakaoLoginFailure(TALK, "ApiFailed", "InvalidToken",
            "-401 this access token does not exist");

        assertTrue(KakaoLoginFailure.report(List.of(failure)).endsWith("talk: -401 this access token does not exist"));
    }

    @Test public void identifiersCannotCarryFreeText() {
        KakaoLoginFailure hostile = new KakaoLoginFailure(TALK, "Client Failed://x?y=z", "a b\nc", null);

        assertEquals("talk:Client_Failed___x_y_z/a_b_c", KakaoLoginFailure.report(List.of(hostile)));
        assertEquals(48, new KakaoLoginFailure(TALK, "x".repeat(200), "r", null).family.length());
    }

    @Test public void whitespaceAndControlCharactersCollapseToSingleSpaces() {
        String text = "one\ntwo\t\tthree" + (char) 0x2028 + "four" + (char) 0x2029 + (char) 0x1 + "  five\r\n";
        String report = KakaoLoginFailure.report(List.of(talk(text)));

        assertTrue(report, report.endsWith("talk: one two three four five"));
        assertFalse(report.contains("\n"));
        assertFalse(report.contains(String.valueOf((char) 0x2028)));
    }
}
