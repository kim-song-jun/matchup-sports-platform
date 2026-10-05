package kr.co.teameet;

/** The cached native inset values are also published again after page load. */
final class NativeInsetsScript {
    private NativeInsetsScript() {}

    static String create(int safeBottom, int keyboardInset, boolean keyboardVisible) {
        return "(()=>{const root=document.documentElement;if(!root)return;"
            + "root.style.setProperty('--teameet-native-safe-bottom','" + safeBottom + "px');"
            + "root.style.setProperty('--v1-shell-safe-bottom','" + safeBottom + "px');"
            + "root.style.setProperty('--teameet-native-keyboard-inset','" + keyboardInset + "px');"
            + "root.dataset.teameetNativeApp='android';"
            + "root.dataset.teameetNativeKeyboard='" + (keyboardVisible ? "open" : "closed") + "';})()";
    }
}
