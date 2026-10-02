package kr.co.teameet;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class FileChooserPolicy {
    private FileChooserPolicy() {}

    static List<String> acceptedMimeTypes(String[] acceptTypes) {
        Set<String> normalized = new LinkedHashSet<>();
        if (acceptTypes != null) {
            for (String acceptType : acceptTypes) {
                if (acceptType == null) continue;
                for (String candidate : acceptType.split(",")) {
                    String mimeType = normalizedMimeType(candidate);
                    int slash = mimeType.indexOf('/');
                    if (slash > 0
                        && slash < mimeType.length() - 1
                        && mimeType.indexOf(';') < 0
                        && mimeType.chars().noneMatch(Character::isWhitespace)) {
                        normalized.add(mimeType);
                    }
                }
            }
        }
        if (normalized.isEmpty()) normalized.add("*/*");
        return new ArrayList<>(normalized);
    }

    private static String normalizedMimeType(String candidate) {
        String value = candidate.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".webp" -> "image/webp";
            case ".gif" -> "image/gif";
            case ".heic" -> "image/heic";
            case ".heif" -> "image/heif";
            case ".pdf" -> "application/pdf";
            default -> value;
        };
    }
    static String primaryMimeType(List<String> mimeTypes) {
        if (mimeTypes == null || mimeTypes.isEmpty()) return "*/*";
        if (mimeTypes.size() == 1) return mimeTypes.get(0);
        String first = mimeTypes.get(0);
        int slash = first.indexOf('/');
        if (slash <= 0) return "*/*";
        String commonGroup = first.substring(0, slash);
        for (String mimeType : mimeTypes) {
            if (!mimeType.startsWith(commonGroup + "/")) return "*/*";
        }
        return commonGroup + "/*";
    }
}
