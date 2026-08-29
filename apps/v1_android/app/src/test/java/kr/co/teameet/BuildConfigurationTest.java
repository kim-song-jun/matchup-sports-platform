package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class BuildConfigurationTest {
    @Test public void applicationIdAndWebOriginStayInTheSameEnvironment() {
        if (BuildConfig.APPLICATION_ID.endsWith(".alpha")) {
            assertEquals("kr.co.teameet.alpha", BuildConfig.APPLICATION_ID);
            assertEquals("https://alpha.teameet.co.kr", BuildConfig.WEB_ORIGIN);
            assertTrue(BuildConfig.WEBVIEW_DEBUGGING_ENABLED);
        } else {
            assertEquals("kr.co.teameet", BuildConfig.APPLICATION_ID);
            assertEquals("https://teameet.co.kr", BuildConfig.WEB_ORIGIN);
            assertFalse(BuildConfig.WEBVIEW_DEBUGGING_ENABLED);
        }
    }
}
