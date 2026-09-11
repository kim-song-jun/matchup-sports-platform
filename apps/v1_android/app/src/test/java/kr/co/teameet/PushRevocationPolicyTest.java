package kr.co.teameet;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class PushRevocationPolicyTest {
    @Test public void signOutKeepsConsentForAutomaticRegistrationAfterNextLogin() {
        assertTrue(PushRevocationPolicy.keepsOptIn("sign-out"));
    }

    @Test public void explicitOptOutAndLegacyMessagesClearConsent() {
        assertFalse(PushRevocationPolicy.keepsOptIn(""));
        assertFalse(PushRevocationPolicy.keepsOptIn(null));
        assertFalse(PushRevocationPolicy.keepsOptIn("user-turned-off"));
    }
}
