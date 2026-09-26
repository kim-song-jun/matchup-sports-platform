package kr.co.teameet;

import android.net.Uri;
import java.net.URI;
import java.util.Locale;
import java.util.Set;

final class AllowedNavigation {
    private static final Set<String> TRUSTED_KAKAO_AUTH_HOSTS = Set.of(
        "kauth.kakao.com",
        "accounts.kakao.com",
        "auth.kakao.com"
    );

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

    static boolean isInternalOrigin(String candidate) {
        if (candidate == null) return false;
        try {
            URI target = URI.create(candidate);
            URI origin = URI.create(BuildConfig.WEB_ORIGIN);
            String path = target.getRawPath();
            return "https".equalsIgnoreCase(target.getScheme())
                && origin.getHost().equalsIgnoreCase(target.getHost())
                && target.getPort() == origin.getPort()
                && target.getRawUserInfo() == null
                && (path == null || path.isEmpty() || "/".equals(path))
                && target.getRawQuery() == null
                && target.getRawFragment() == null;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    static boolean isTrustedAuthProvider(Uri target) {
        return target != null && isTrustedAuthProviderAbsoluteUrl(target.toString());
    }

    static boolean isTrustedAuthProviderAbsoluteUrl(String candidate) {
        if (candidate == null) return false;
        try {
            URI target = URI.create(candidate);
            String host = target.getHost();
            return "https".equalsIgnoreCase(target.getScheme())
                && host != null
                && TRUSTED_KAKAO_AUTH_HOSTS.contains(host.toLowerCase(Locale.ROOT))
                && target.getRawUserInfo() == null
                && target.getPort() == -1;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    static boolean isAllowedExternal(Uri target) {
        return target != null && isAllowedExternalScheme(target.getScheme());
    }

    static boolean isAllowedExternalScheme(String scheme) {
        if (scheme == null) return false;
        return switch (scheme.toLowerCase(Locale.ROOT)) {
            case "http", "https", "mailto", "tel", "sms", "geo", "market",
                "kakaomap", "nmap", "tmap" -> true;
            default -> false;
        };
    }

    static String externalAppStoreFallback(Uri target) {
        return target == null ? null : externalAppStoreFallback(target.getScheme());
    }

    static String externalAppStoreFallback(String scheme) {
        if (scheme == null) return null;
        String packageName = switch (scheme.toLowerCase(Locale.ROOT)) {
            case "kakaomap" -> "net.daum.android.map";
            case "nmap" -> "com.nhn.android.nmap";
            case "tmap" -> "com.skt.tmap.ku";
            default -> null;
        };
        return packageName == null
            ? null
            : "https://play.google.com/store/apps/details?id=" + packageName;
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
