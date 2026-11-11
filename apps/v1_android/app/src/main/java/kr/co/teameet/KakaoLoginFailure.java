package kr.co.teameet;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * One failed Kakao sign-in step, reduced to values that are safe to log. SDK messages can echo
 * URLs, authorization codes and tokens, so nothing reaches the page except what passes through here.
 * No Android or Kakao SDK types.
 */
final class KakaoLoginFailure {
    enum Step {
        TALK("talk"), ACCOUNT("account"), CONSENT("consent");

        final String label;

        Step(String label) {
            this.label = label;
        }
    }

    static final int REPORT_LIMIT = 300;
    private static final int DETAIL_LIMIT = 100;
    private static final int IDENTIFIER_LIMIT = 48;

    final Step step;
    /** {@code ClientFailed}, {@code ApiFailed}, {@code AuthFailed}, or {@code Other} for a non-SDK error. */
    final String family;
    final String reason;
    /** Null when the step has nothing safe to add. */
    final String detail;

    KakaoLoginFailure(Step step, String family, String reason, String detail) {
        this.step = step;
        this.family = identifier(family);
        this.reason = identifier(reason);
        String cleaned = detail == null ? "" : sanitized(detail, DETAIL_LIMIT);
        this.detail = cleaned.isEmpty() ? null : cleaned;
    }

    /**
     * The text the page logs as the failure reason. Classifications come first and details after,
     * so the leading characters identify every failed step even where the consumer truncates.
     */
    static String report(List<KakaoLoginFailure> failures) {
        List<String> classes = new ArrayList<>();
        List<String> details = new ArrayList<>();
        for (KakaoLoginFailure failure : failures) {
            classes.add(failure.step.label + ":" + failure.family + "/" + failure.reason);
            if (failure.detail != null) details.add(failure.step.label + ": " + failure.detail);
        }
        List<String> parts = new ArrayList<>();
        parts.add(String.join(" ", classes));
        parts.addAll(details);
        return truncated(String.join(" | ", parts), REPORT_LIMIT);
    }

    // Applied in order: a URL is removed whole before the narrower patterns look inside it.
    private static final Pattern URL = Pattern.compile("[A-Za-z][A-Za-z0-9+.\\-]*://\\S*");
    private static final Pattern KEYED_SECRET = Pattern.compile(
        "(?i)\\b(access_token|refresh_token|id_token|code_verifier|client_secret|code|token|state)=\\S+");
    private static final Pattern BEARER = Pattern.compile("(?i)\\bbearer\\s+\\S+");
    private static final Pattern QUERY = Pattern.compile("\\?\\S*=\\S*");
    // Tokens and authorization codes are long unbroken runs; prose is not.
    private static final Pattern LONG_RUN = Pattern.compile("[A-Za-z0-9_\\-.~+/=]{32,}");

    static String sanitized(String raw, int limit) {
        String text = collapseSeparators(raw);
        text = URL.matcher(text).replaceAll("<url>");
        text = KEYED_SECRET.matcher(text).replaceAll("$1=<redacted>");
        text = BEARER.matcher(text).replaceAll("Bearer <redacted>");
        text = QUERY.matcher(text).replaceAll("?<query>");
        text = LONG_RUN.matcher(text).replaceAll("<redacted>");
        return truncated(text, limit);
    }

    // Done before redaction so that \S stops at U+2028/2029 and control characters, as it does at a space.
    private static String collapseSeparators(String raw) {
        StringBuilder out = new StringBuilder(raw.length());
        boolean pendingSpace = false;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (Character.isWhitespace(c) || Character.isSpaceChar(c) || Character.isISOControl(c)) {
                pendingSpace = out.length() > 0;
            } else {
                if (pendingSpace) out.append(' ');
                pendingSpace = false;
                out.append(c);
            }
        }
        return out.toString();
    }

    /** Enum case and type names only: anything else becomes an underscore. */
    private static String identifier(String raw) {
        int length = Math.min(raw.length(), IDENTIFIER_LIMIT);
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            char c = raw.charAt(i);
            boolean plain = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                || c == '_' || c == '.' || c == '-';
            out.append(plain ? c : '_');
        }
        return out.toString();
    }

    private static String truncated(String text, int limit) {
        if (text.codePointCount(0, text.length()) <= limit) return text;
        return text.substring(0, text.offsetByCodePoints(0, limit - 1)) + "…";
    }
}
