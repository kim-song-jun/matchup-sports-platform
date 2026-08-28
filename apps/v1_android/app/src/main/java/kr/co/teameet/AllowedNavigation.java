package kr.co.teameet;

import android.net.Uri;
import java.net.URI;

final class AllowedNavigation {
    private AllowedNavigation() {}

    static boolean isInternal(Uri target) {
        if (target == null || target.getScheme() == null || target.getHost() == null) return false;
        URI origin = URI.create(BuildConfig.WEB_ORIGIN);
        return "https".equalsIgnoreCase(target.getScheme())
            && origin.getHost().equalsIgnoreCase(target.getHost())
            && target.getPort() == origin.getPort()
            && target.getUserInfo() == null;
    }

    static boolean isTrustedAuthProvider(Uri target) {
        return target != null
            && "https".equalsIgnoreCase(target.getScheme())
            && "kauth.kakao.com".equalsIgnoreCase(target.getHost())
            && target.getUserInfo() == null
            && target.getPort() == -1;
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
