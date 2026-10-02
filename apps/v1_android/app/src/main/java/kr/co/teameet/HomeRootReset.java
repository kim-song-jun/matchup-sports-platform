package kr.co.teameet;

/**
 * Makes /home the WebView's root after a policy-driven NAVIGATE_HOME.
 *
 * loadUrl(/home) pushes a history entry, so canGoBack() turns true at /home and back would
 * ping-pong between the previous page and /home forever. clearHistory() only drops entries
 * committed before the current page, so it must run once the /home load has finished.
 */
final class HomeRootReset {
    private boolean pending;

    void onNavigateHome() {
        pending = true;
    }

    /** A new back press supersedes a navigate-home whose /home load never finished (e.g. redirected). */
    void onBackPressed() {
        pending = false;
    }

    /**
     * Returns true when the caller must call clearHistory() for this finished load. Any finished
     * load ends the pending reset: a redirected home load must not wipe history on a later /home.
     */
    boolean onPageFinished(String url) {
        boolean clear = pending && BackNavigationPolicy.isHome(url);
        pending = false;
        return clear;
    }
}
