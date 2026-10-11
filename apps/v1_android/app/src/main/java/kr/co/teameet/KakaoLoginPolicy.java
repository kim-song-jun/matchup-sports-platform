package kr.co.teameet;

/** Pure decisions and bridge payloads for native Kakao login; no Android or Kakao SDK types. */
final class KakaoLoginPolicy {
    static final String ACTION = "sign-in-with-kakao";
    static final String RESULT_EVENT = "teameet:native-kakao-result";

    private KakaoLoginPolicy() {}

    static boolean isEnabled(String nativeAppKey) {
        return nativeAppKey != null && !nativeAppKey.trim().isEmpty();
    }

    /** Null when the build has no key, so the web keeps its URL flow. Idempotent; safe to run twice. */
    static String capabilityScript(String nativeAppKey) {
        if (!isEnabled(nativeAppKey)) return null;
        return "(()=>{const b=window.TeameetNative;if(!b)return;"
            + "const s=Array.isArray(b.supports)?b.supports:[];"
            + "if(!s.includes('" + ACTION + "'))b.supports=s.concat('" + ACTION + "');})()";
    }

    /** A cancelled KakaoTalk attempt ends the flow; any other talk failure may retry with the account page. */
    static boolean shouldFallBackToAccountLogin(boolean cancelled) {
        return !cancelled;
    }

    static String successScript(String requestId, String accessToken) {
        return resultScript(requestId, "\"accessToken\":" + quote(accessToken));
    }

    static String cancelledScript(String requestId) {
        return resultScript(requestId, "\"cancelled\":true");
    }

    static String errorScript(String requestId, String code) {
        return resultScript(requestId, "\"error\":" + quote(code));
    }

    private static String resultScript(String requestId, String field) {
        return "window.dispatchEvent(new CustomEvent('" + RESULT_EVENT + "',{detail:{\"requestId\":"
            + quote(requestId) + "," + field + "}}))";
    }

    static String quote(String value) {
        String text = value == null ? "" : value;
        StringBuilder out = new StringBuilder(text.length() + 2).append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                // U+2028/2029 end a JS line, so they are escaped like control characters.
                default -> {
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }
}
