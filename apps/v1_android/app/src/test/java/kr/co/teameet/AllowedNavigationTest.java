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

    @Test public void allowsOnlyReviewedExternalSchemes() {
        assertEquals(true, AllowedNavigation.isAllowedExternalScheme("https"));
        assertEquals(true, AllowedNavigation.isAllowedExternalScheme("intent"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("javascript"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("file"));
        assertEquals(false, AllowedNavigation.isAllowedExternalScheme("content"));
    }
}
