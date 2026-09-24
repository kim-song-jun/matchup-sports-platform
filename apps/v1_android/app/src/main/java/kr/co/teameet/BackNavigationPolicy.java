package kr.co.teameet;

import java.net.URI;

/** Decides what a hardware/gesture back press should do; the WebView is never touched here. */
final class BackNavigationPolicy {
    static final long EXIT_CONFIRMATION_WINDOW_MILLIS = 2_000L;
    static final long NO_PREVIOUS_PRESS_MILLIS = -1L;
    private static final String HOME_PATH = "/home";

    enum Action { GO_BACK, NAVIGATE_HOME, SHOW_EXIT_HINT, EXIT }

    private BackNavigationPolicy() {}

    static Action decide(
        boolean canGoBack, String currentUrl, long lastBackPressAtMillis, long nowMillis
    ) {
        if (canGoBack) return Action.GO_BACK;
        if (!isHome(currentUrl)) return Action.NAVIGATE_HOME;
        boolean withinExitWindow = lastBackPressAtMillis != NO_PREVIOUS_PRESS_MILLIS
            && nowMillis - lastBackPressAtMillis <= EXIT_CONFIRMATION_WINDOW_MILLIS;
        return withinExitWindow ? Action.EXIT : Action.SHOW_EXIT_HINT;
    }

    static boolean isHome(String currentUrl) {
        if (currentUrl == null || currentUrl.isBlank()) return false;
        try {
            return HOME_PATH.equals(URI.create(currentUrl).getPath());
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }
}
