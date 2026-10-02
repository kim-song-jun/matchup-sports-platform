package kr.co.teameet;

/** Keeps logout separate from an explicit notification opt-out. */
final class PushRevocationPolicy {
    static final String SIGN_OUT_REASON = "sign-out";

    private PushRevocationPolicy() {}

    static boolean keepsOptIn(String reason) {
        return SIGN_OUT_REASON.equals(reason);
    }
}
