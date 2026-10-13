package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import com.google.android.play.core.install.model.UpdateAvailability;
import org.junit.Test;

public final class NativeAppUpdatePolicyTest {
    @Test public void onlyAPlayConfirmedNewerBuildRequiresAnUpdate() {
        assertEquals("update-required", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.UPDATE_AVAILABLE, 5, 4));
        assertEquals("update-required", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS, 5, 4));
        assertEquals("up-to-date", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.UPDATE_AVAILABLE, 4, 4));
        assertEquals("up-to-date", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.UPDATE_NOT_AVAILABLE, -1, 4));
        assertEquals("unavailable", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.UNKNOWN, -1, 4));
        assertEquals("unavailable", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.UPDATE_AVAILABLE, -1, 4));
    }

    @Test public void unknownPlayStateCarriesAnErrorCodeWithoutSensitiveData() {
        assertEquals("play-check-unavailable", NativeAppUpdatePolicy.errorFor(
            UpdateAvailability.UNKNOWN, -1, 4));
        assertEquals("play-check-unavailable", NativeAppUpdatePolicy.errorFor(
            UpdateAvailability.UPDATE_AVAILABLE, -1, 4));
        assertEquals("update-required", NativeAppUpdatePolicy.statusFor(
            UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS, 5, 4));
    }

    @Test public void capabilitiesAreAddedWithoutDroppingExistingEntriesAndAnnounced() {
        String script = NativeAppUpdatePolicy.capabilityScript();
        assertTrue(script.contains("'check-app-update'"));
        assertTrue(script.contains("s.concat"));
        assertTrue(script.contains("teameet:native-capabilities-ready"));
    }

    @Test public void resultContainsTheStableContractAndEscapesRequestId() {
        String script = NativeAppUpdatePolicy.resultScript(
            "r\"1", NativeAppUpdatePolicy.CHANNEL_PRODUCTION, "0.1.3", 4,
            "update-required", 5, null);
        assertTrue(script.contains("'teameet:native-app-update-result'"));
        assertTrue(script.contains("\"requestId\":\"r\\\"1\""));
        assertTrue(script.contains("\"platform\":\"android\""));
        assertTrue(script.contains("\"channel\":\"production\""));
        assertTrue(script.contains("\"version\":\"0.1.3\""));
        assertTrue(script.contains("\"build\":\"4\""));
        assertTrue(script.contains("\"availableBuild\":5"));
        assertFalse(script.contains("accessToken"));
    }
}
