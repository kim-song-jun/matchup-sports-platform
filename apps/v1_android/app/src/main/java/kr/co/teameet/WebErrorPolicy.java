package kr.co.teameet;

/**
 * Decides when the native "could not load" overlay replaces the page.
 *
 * <p>Only server failures qualify. A 4xx main-frame response is the web's own not-found or
 * access page (a deleted match opened from a notification, for instance) and must stay
 * visible; covering it with a connectivity message whose retry reloads the same 404 traps
 * the reader. Same boundary as iOS WebShellFailurePolicy.
 */
final class WebErrorPolicy {
    static final int SERVER_ERROR_STATUS_CODE = 500;

    private WebErrorPolicy() {}

    static boolean shouldShowErrorForHttpStatus(int statusCode, boolean isMainFrame) {
        return isMainFrame && statusCode >= SERVER_ERROR_STATUS_CODE;
    }
}
