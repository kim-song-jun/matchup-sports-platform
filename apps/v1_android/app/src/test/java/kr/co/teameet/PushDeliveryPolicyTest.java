package kr.co.teameet;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class PushDeliveryPolicyTest {
    @Test public void displaysOnlyWhenPermissionAndUserOptInAreBothPresent() {
        assertTrue(PushDeliveryPolicy.shouldDisplay(true, true));
        assertFalse(PushDeliveryPolicy.shouldDisplay(false, true));
        assertFalse(PushDeliveryPolicy.shouldDisplay(true, false));
        assertFalse(PushDeliveryPolicy.shouldDisplay(false, false));
    }

    @Test public void keepsFcmAutoInitOnlyWithActiveConsent() {
        assertTrue(PushDeliveryPolicy.hasActiveConsent(true, true));
        assertFalse(PushDeliveryPolicy.hasActiveConsent(false, true));
        assertFalse(PushDeliveryPolicy.hasActiveConsent(true, false));
        assertFalse(PushDeliveryPolicy.hasActiveConsent(false, false));
    }
}
