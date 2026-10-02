package kr.co.teameet;

final class PushDeliveryPolicy {
    private PushDeliveryPolicy() {}

    static boolean shouldDisplay(boolean permissionGranted, boolean optedIn) {
        return hasActiveConsent(permissionGranted, optedIn);
    }

    static boolean hasActiveConsent(boolean permissionGranted, boolean optedIn) {
        return permissionGranted && optedIn;
    }
}
