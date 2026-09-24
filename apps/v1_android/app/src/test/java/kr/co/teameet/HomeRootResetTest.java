package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class HomeRootResetTest {
    private static final String ORIGIN = "https://alpha.teameet.co.kr";

    /** WebView back/forward list model: loadUrl pushes, goBack moves, clearHistory keeps only the current entry. */
    private static final class FakeWebView {
        final List<String> entries = new ArrayList<>();
        int index = -1;

        FakeWebView(String... urls) {
            for (String url : urls) loadUrl(url);
        }
        boolean canGoBack() { return index > 0; }
        String url() { return entries.get(index); }
        void loadUrl(String url) {
            while (entries.size() > index + 1) entries.remove(entries.size() - 1);
            entries.add(url);
            index++;
        }
        void goBack() { index--; }
        void clearHistory() {
            String current = url();
            entries.clear();
            entries.add(current);
            index = 0;
        }
    }

    /** Mirrors MainActivity's back handler + onPageFinished wiring; returns the actions taken. */
    private static List<BackNavigationPolicy.Action> pressBack(FakeWebView web, HomeRootReset reset, int presses) {
        List<BackNavigationPolicy.Action> actions = new ArrayList<>();
        long lastPress = BackNavigationPolicy.NO_PREVIOUS_PRESS_MILLIS;
        long now = 10_000L;
        for (int i = 0; i < presses; i++, now += 500L) {
            reset.onBackPressed();
            BackNavigationPolicy.Action action =
                BackNavigationPolicy.decide(web.canGoBack(), web.url(), lastPress, now);
            actions.add(action);
            switch (action) {
                case GO_BACK -> web.goBack();
                case NAVIGATE_HOME -> {
                    reset.onNavigateHome();
                    web.loadUrl(ORIGIN + "/home");
                    if (reset.onPageFinished(web.url())) web.clearHistory();
                }
                case SHOW_EXIT_HINT -> lastPress = now;
                case EXIT -> { return actions; }
            }
        }
        return actions;
    }

    @Test public void backFromAColdStartParentReachesHomeAndThenExitsInsteadOfPingPonging() {
        // Notification cold start: the web inserted /teams as the parent of /teams/1.
        FakeWebView web = new FakeWebView(ORIGIN + "/teams", ORIGIN + "/teams/1");
        List<BackNavigationPolicy.Action> actions = pressBack(web, new HomeRootReset(), 8);

        assertEquals(List.of(
            BackNavigationPolicy.Action.GO_BACK,
            BackNavigationPolicy.Action.NAVIGATE_HOME,
            BackNavigationPolicy.Action.SHOW_EXIT_HINT,
            BackNavigationPolicy.Action.EXIT), actions);
        assertEquals(List.of(ORIGIN + "/home"), web.entries);
    }

    @Test public void clearsOnlyForTheHomeLoadThatFollowsANavigateHome() {
        HomeRootReset reset = new HomeRootReset();
        assertFalse(reset.onPageFinished(ORIGIN + "/home"));

        reset.onNavigateHome();
        assertFalse(reset.onPageFinished(ORIGIN + "/teams/1"));
        assertTrue(reset.onPageFinished(ORIGIN + "/home?from=%2Fteams"));
        assertFalse(reset.onPageFinished(ORIGIN + "/home"));
    }

    @Test public void aLaterBackPressCancelsAPendingResetWhoseHomeLoadNeverFinished() {
        HomeRootReset reset = new HomeRootReset();
        reset.onNavigateHome();
        reset.onBackPressed();
        assertFalse(reset.onPageFinished(ORIGIN + "/home"));
    }
}
