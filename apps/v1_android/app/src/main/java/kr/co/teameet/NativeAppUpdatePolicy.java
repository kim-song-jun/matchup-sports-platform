package kr.co.teameet;

import com.google.android.play.core.install.model.UpdateAvailability;
import org.json.JSONException;
import org.json.JSONObject;

/** Pure bridge payload and Play availability decisions for mandatory store updates. */
final class NativeAppUpdatePolicy {
    static final String ACTION = "check-app-update";
    static final String RESULT_EVENT = "teameet:native-app-update-result";
    static final String CHANNEL_PRODUCTION = "production";
    static final String CHANNEL_ALPHA = "alpha";

    private NativeAppUpdatePolicy() {}

    static String capabilityScript() {
        return "(()=>{const b=window.TeameetNative;if(b){"
            + "const s=Array.isArray(b.supports)?b.supports:[];"
            + "if(!s.includes('" + ACTION + "'))b.supports=s.concat('" + ACTION + "');}"
            + "window.dispatchEvent(new Event('teameet:native-capabilities-ready'));})()";
    }

    static String statusFor(int availability, int availableBuild, int installedBuild) {
        boolean updateReported = availability == UpdateAvailability.UPDATE_AVAILABLE
            || availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS;
        if (updateReported && availableBuild <= 0) return "unavailable";
        if (updateReported && availableBuild > installedBuild) return "update-required";
        if (availability == UpdateAvailability.UPDATE_NOT_AVAILABLE || updateReported) return "up-to-date";
        return "unavailable";
    }

    static String errorFor(int availability, int availableBuild, int installedBuild) {
        return statusFor(availability, availableBuild, installedBuild).equals("unavailable")
            ? "play-check-unavailable"
            : null;
    }

    static String resultScript(
        String requestId,
        String channel,
        String version,
        int installedBuild,
        String status,
        Integer availableBuild,
        String error
    ) {
        JSONObject detail = new JSONObject();
        try {
            detail.put("requestId", requestId == null ? "" : requestId);
            detail.put("platform", "android");
            detail.put("channel", channel);
            detail.put("version", version);
            detail.put("build", Integer.toString(installedBuild));
            detail.put("status", status);
            if (availableBuild != null) detail.put("availableBuild", availableBuild);
            if (error != null) detail.put("error", error);
        } catch (JSONException impossible) {
            throw new IllegalStateException("Unable to serialize app update result", impossible);
        }
        return "window.dispatchEvent(new CustomEvent('" + RESULT_EVENT + "',{detail:" + detail + "}))";
    }
}
