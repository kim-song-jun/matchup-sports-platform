package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import org.json.JSONObject;
import org.junit.Test;
import java.util.Arrays;
import java.util.List;

public final class KakaoLoginPolicyTest {
    @Test public void asksOnlyForConfiguredScopesThatAreNotAlreadyGranted() {
        assertEquals(List.of("phone_number", "gender"), KakaoLoginPolicy.additionalScopes(
            Arrays.asList("name", "phone_number", "gender", "gender", "", null, "bad scope"),
            List.of("name")));
        assertEquals(List.of("name"), KakaoLoginPolicy.additionalScopes(List.of("name"), null));
        assertTrue(KakaoLoginPolicy.additionalScopes(List.of("name"), List.of("name")).isEmpty());
    }

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
                + "{detail:{\"requestId\":\"r-1\",\"error\":\"kakao-unavailable\"}}))",
            KakaoLoginPolicy.errorScript("r-1", "kakao-unavailable"));
    }

    @Test public void untrustedValuesCannotBreakOutOfTheScriptLiteral() {
        String script = KakaoLoginPolicy.successScript("a\"});alert(1);//", "x\\y\nz ");
        assertTrue(script.contains("\"a\\\"});alert(1);//\""));
        assertTrue(script.contains("\"x\\\\y\\nz\\u2028\""));
        assertFalse(script.contains(" "));
    }

    @Test public void anyFailureReasonSurvivesTheBridgeVerbatimAndInert() throws Exception {
        String hostile = "He said \"no\" \\ path 'x' </script> line\nbreak\r" + (char) 0x2028 + "ls" + (char) 0x2029
            + "ps \u0001 end";

        String script = KakaoLoginPolicy.errorScript("r1", hostile);

        assertInert(script);
        JSONObject detail = detailOf(script);
        assertEquals(hostile, detail.getString("error"));
        assertEquals("r1", detail.getString("requestId"));
    }

    @Test public void aReportBuiltFromHostileDetailsStillReachesThePageIntact() throws Exception {
        String hostile = "quote \" backslash \\ apostrophe ' </script>\nline" + (char) 0x2028 + "separator";
        String report = KakaoLoginFailure.report(List.of(new KakaoLoginFailure(
            KakaoLoginFailure.Step.TALK, "ClientFailed", "Unknown", hostile)));

        String script = KakaoLoginPolicy.errorScript("r1", report);

        assertInert(script);
        assertEquals(report, detailOf(script).getString("error"));
        assertTrue(report, report.contains("</script>"));
    }

    /** The script is a single statement: a raw line break or separator would end it early. */
    private static void assertInert(String script) {
        for (char terminator : new char[] {'\n', '\r', 0x2028, 0x2029}) {
            assertFalse("raw U+" + Integer.toHexString(terminator), script.indexOf(terminator) >= 0);
        }
    }

    private static JSONObject detailOf(String script) throws Exception {
        String prefix = "window.dispatchEvent(new CustomEvent('teameet:native-kakao-result',{detail:";
        assertTrue(script, script.startsWith(prefix));
        assertTrue(script, script.endsWith("}))"));
        return new JSONObject(script.substring(prefix.length(), script.length() - 3));
    }
}
