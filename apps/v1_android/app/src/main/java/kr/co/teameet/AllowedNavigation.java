package kr.co.teameet;

import android.net.Uri;
import java.net.URI;
import java.util.Locale;

final class AllowedNavigation {
    private AllowedNavigation() {}

    static boolean isInternal(Uri target) {
        return target != null && isInternalAbsoluteUrl(target.toString());
    }

    static boolean isInternalAbsoluteUrl(String candidate) {
        if (candidate == null) return false;
        try {
            URI target = URI.create(candidate);
            URI origin = URI.create(BuildConfig.WEB_ORIGIN);
            return "https".equalsIgnoreCase(target.getScheme())
                && origin.getHost().equalsIgnoreCase(target.getHost())
                && target.getPort() == origin.getPort()
                && target.getRawUserInfo() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    static boolean isTrustedAuthProvider(Uri target) {
        return target != null
            && "https".equalsIgnoreCase(target.getScheme())
            && "kauth.kakao.com".equalsIgnoreCase(target.getHost())
            && target.getUserInfo() == null
            && target.getPort() == -1;
    }

    static boolean isAllowedExternal(Uri target) {
        return target != null && isAllowedExternalScheme(target.getScheme());
    }

    static boolean isAllowedExternalScheme(String scheme) {
        if (scheme == null) return false;
        return switch (scheme.toLowerCase(Locale.ROOT)) {
            case "http", "https", "mailto", "tel", "sms", "geo", "market", "intent" -> true;
            default -> false;
        };
    }

    static String safeRoute(String candidate) {
        if (candidate == null || !candidate.startsWith("/") || candidate.startsWith("//")) {
            return "/notifications";
        }
        try {
            URI parsed = URI.create(candidate);
            if (parsed.isAbsolute() || parsed.getHost() != null || parsed.getUserInfo() != null) {
                return "/notifications";
            }
            return candidate;
        } catch (IllegalArgumentException ignored) {
            return "/notifications";
        }
    }
}
