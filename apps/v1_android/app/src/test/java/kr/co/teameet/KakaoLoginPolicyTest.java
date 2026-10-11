package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class KakaoLoginPolicyTest {
    @Test public void buildsWithoutAKeyDoNotAdvertiseTheCapability() {
        assertFalse(KakaoLoginPolicy.isEnabled(""));
        assertFalse(KakaoLoginPolicy.isEnabled("   "));
        assertFalse(KakaoLoginPolicy.isEnabled(null));
        assertNull(KakaoLoginPolicy.capabilityScript(""));
        assertNull(KakaoLoginPolicy.capabilityScript(null));
    }

    @Test public void buildsWithAKeyAdvertiseTheActionWithoutDroppingExistingEntries() {
        assertTrue(KakaoLoginPolicy.isEnabled("0123456789abcdef0123456789abcdef"));
        String script = KakaoLoginPolicy.capabilityScript("0123456789abcdef0123456789abcdef");
        assertTrue(script.contains("'sign-in-with-kakao'"));
        assertTrue(script.contains("s.concat"));
        assertFalse(script.contains("0123456789abcdef"));
    }

    @Test public void onlyANonCancelledTalkFailureFallsBackToTheAccountPage() {
        assertFalse(KakaoLoginPolicy.shouldFallBackToAccountLogin(true));
        assertTrue(KakaoLoginPolicy.shouldFallBackToAccountLogin(false));
    }

    @Test public void resultScriptsCarryTheRequestIdAndExactlyOneOutcome() {
        assertEquals(
            "window.dispatchEvent(new CustomEvent('teameet:native-kakao-result',"
                + "{detail:{\"requestId\":\"r-1\",\"accessToken\":\"tok\"}}))",
            KakaoLoginPolicy.successScript("r-1", "tok"));
        assertEquals(
            "window.dispatchEvent(new CustomEvent('teameet:native-kakao-result',"
                + "{detail:{\"requestId\":\"r-1\",\"cancelled\":true}}))",
            KakaoLoginPolicy.cancelledScript("r-1"));
        assertEquals(
            "window.dispatchEvent(new CustomEvent('teameet:native-kakao-result',"
                + "{detail:{\"requestId\":\"r-1\",\"error\":\"kakao-login-failed\"}}))",
            KakaoLoginPolicy.errorScript("r-1", "kakao-login-failed"));
    }

    @Test public void untrustedValuesCannotBreakOutOfTheScriptLiteral() {
        String script = KakaoLoginPolicy.successScript("a\"});alert(1);//", "x\\y\nz ");
        assertTrue(script.contains("\"a\\\"});alert(1);//\""));
        assertTrue(script.contains("\"x\\\\y\\nz\\u2028\""));
        assertFalse(script.contains(" "));
    }
}
