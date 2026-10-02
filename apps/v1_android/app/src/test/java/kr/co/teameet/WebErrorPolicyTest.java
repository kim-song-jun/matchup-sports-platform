package kr.co.teameet;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class WebErrorPolicyTest {
    @Test public void webNotFoundAndAuthPagesStayVisible() {
        assertFalse(WebErrorPolicy.shouldShowErrorForHttpStatus(404, true));
        assertFalse(WebErrorPolicy.shouldShowErrorForHttpStatus(401, true));
        assertFalse(WebErrorPolicy.shouldShowErrorForHttpStatus(403, true));
        assertFalse(WebErrorPolicy.shouldShowErrorForHttpStatus(499, true));
    }

    @Test public void mainFrameServerFailuresShowTheNativeErrorView() {
        assertTrue(WebErrorPolicy.shouldShowErrorForHttpStatus(500, true));
        assertTrue(WebErrorPolicy.shouldShowErrorForHttpStatus(502, true));
        assertTrue(WebErrorPolicy.shouldShowErrorForHttpStatus(503, true));
    }

    @Test public void subresourceFailuresNeverCoverThePage() {
        assertFalse(WebErrorPolicy.shouldShowErrorForHttpStatus(502, false));
        assertFalse(WebErrorPolicy.shouldShowErrorForHttpStatus(404, false));
    }
}
