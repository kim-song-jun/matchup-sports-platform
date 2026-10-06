package kr.co.teameet;

import java.net.URLDecoder;
import java.io.UnsupportedEncodingException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads the UTF-8 filename supplied by the API instead of the /file route basename. */
final class DownloadFileName {
    private static final Pattern PARAMETER = Pattern.compile(
        "(?:^|;)\\s*filename(\\*)?\\s*=\\s*(?:\"([^\"]*)\"|([^;]*))",
        Pattern.CASE_INSENSITIVE
    );

    private DownloadFileName() {}

    static String fromContentDisposition(String disposition) {
        if (disposition == null) return null;
        String plain = null;
        Matcher matcher = PARAMETER.matcher(disposition);
        while (matcher.find()) {
            String value = matcher.group(2) != null ? matcher.group(2) : matcher.group(3);
            if (matcher.group(1) == null) {
                plain = safeBaseName(value);
                continue;
            }
            value = value.trim();
            int firstQuote = value.indexOf('\'');
            int secondQuote = value.indexOf('\'', firstQuote + 1);
            if (firstQuote < 0 || secondQuote < 0
                || !value.substring(0, firstQuote).equalsIgnoreCase("UTF-8")) continue;
            try {
                // RFC 5987 is percent encoding, not form encoding: a literal '+' stays '+'.
                String decoded = URLDecoder.decode(
                    value.substring(secondQuote + 1).replace("+", "%2B"), "UTF-8"
                );
                String name = safeBaseName(decoded);
                if (name != null) return name;
            } catch (IllegalArgumentException | UnsupportedEncodingException ignored) {
                // An invalid extended parameter does not invalidate an ordinary filename.
            }
        }
        return plain;
    }

    private static String safeBaseName(String value) {
        if (value.chars().anyMatch(Character::isISOControl)) return null;
        String name = value.substring(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1).trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")
            || name.chars().anyMatch(c -> Character.isISOControl(c) || c == 0xfffd)) return null;
        return name;
    }
}
