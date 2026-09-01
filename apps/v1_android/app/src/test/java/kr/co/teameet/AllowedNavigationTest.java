package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class AllowedNavigationTest {
    @Test public void acceptsRelativeApplicationRoutes() {
        assertEquals("/my/inquiries/inquiry-1", AllowedNavigation.safeRoute("/my/inquiries/inquiry-1"));
    }

    @Test public void rejectsProtocolRelativeAndAbsoluteRoutes() {
        assertEquals("/notifications", AllowedNavigation.safeRoute("//attacker.example/path"));
        assertEquals("/notifications", AllowedNavigation.safeRoute("https://attacker.example/path"));
    }

    @Test public void allowsDownloadsOnlyFromTheExactEnvironmentOrigin() {
        String origin = BuildConfig.APPLICATION_ID.endsWith(".alpha")
            ? "https://alpha.teameet.co.kr"
            : "https://teameet.co.kr";
        assertEquals(true, AllowedNavigation.isInternalAbsoluteUrl(origin + "/api/v1/exports/report.csv?download=1"));
        assertEquals(false, AllowedNavigation.isInternalAbsoluteUrl(origin.replace("https://", "http://") + "/report.csv"));
        assertEquals(false, AllowedNavigation.isInternalAbsoluteUrl(origin + ".attacker.example/report.csv"));
        assertEquals(false, AllowedNavigation.isInternalAbsoluteUrl("https://user@" + origin.substring("https://".length()) + "/report.csv"));
        assertEquals(false, AllowedNavigation.isInternalAbsoluteUrl("not a url"));
    }

    @Test public void allowsOnlyReviewedExternalSchemes() {
        assertEquals(true, AllowedNavigation.isAllowedExternalScheme("https"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("intent"));
        assertEquals(true, AllowedNavigation.isAllowedExternalScheme("kakaomap"));
        assertEquals(true, AllowedNavigation.isAllowedExternalScheme("NMAP"));
        assertEquals(true, AllowedNavigation.isAllowedExternalScheme("tmap"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("javascript"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("file"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("content"));
    }

    @Test public void grantsGeolocationOnlyToTheExactEnvironmentOrigin() {
        String origin = BuildConfig.APPLICATION_ID.endsWith(".alpha")
            ? "https://alpha.teameet.co.kr"
            : "https://teameet.co.kr";
        assertEquals(true, AllowedNavigation.isInternalOrigin(origin));
        assertEquals(true, AllowedNavigation.isInternalOrigin(origin + "/"));
        assertEquals(false, AllowedNavigation.isInternalOrigin(origin + "/location"));
        assertEquals(false, AllowedNavigation.isInternalOrigin(origin + "?next=/home"));
        assertEquals(false, AllowedNavigation.isInternalOrigin(origin + ".attacker.example"));
    }

    @Test public void mapsReviewedNavigationAppsToTheirPlayStoreFallbacks() {
        assertEquals(
            "https://play.google.com/store/apps/details?id=net.daum.android.map",
            AllowedNavigation.externalAppStoreFallback("kakaomap")
        );
        assertEquals(
            "https://play.google.com/store/apps/details?id=com.nhn.android.nmap",
            AllowedNavigation.externalAppStoreFallback("nmap")
        );
        assertEquals(
            "https://play.google.com/store/apps/details?id=com.skt.tmap.ku",
            AllowedNavigation.externalAppStoreFallback("tmap")
        );
        assertEquals(
            null,
            AllowedNavigation.externalAppStoreFallback("https")
        );
    }
}
