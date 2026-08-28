package kr.co.teameet;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Collections;
import org.json.JSONObject;

public final class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ValueCallback<Uri[]> pendingFileChooser;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<String> notificationPermissionLauncher;
    private String pendingPushRequestId;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                Uri[] uris = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(uris);
                pendingFileChooser = null;
            });
        notificationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            granted -> {
                String requestId = pendingPushRequestId;
                pendingPushRequestId = null;
                if (!granted) {
                    reportPushResult(requestId, false);
                    return;
                }
                registerPushAndReport(requestId);
            });
        configureWebView();
        setContentView(webView);
        registerBackHandler();
        if (FirebaseBootstrap.initialize(this)) {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                InstallationIdentity.saveToken(this, token);
                PushRegistrationClient.register(this);
            });
        }
        webView.loadUrl(BuildConfig.WEB_ORIGIN + routeFromIntent(getIntent()));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebViewCompat.setSafeBrowsingEnabled(webView, true);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView,
                "TeameetNative",
                Collections.singleton(BuildConfig.WEB_ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (isMainFrame) handleNativeMessage(message);
                });
        }
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (AllowedNavigation.isInternal(target) || AllowedNavigation.isTrustedAuthProvider(target)) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, target));
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (AllowedNavigation.isInternal(Uri.parse(url))) PushRegistrationClient.register(MainActivity.this);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(
                WebView view, ValueCallback<Uri[]> callback, FileChooserParams params
            ) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                fileChooserLauncher.launch(params.createIntent());
                return true;
            }
        });
    }

    private void handleNativeMessage(WebMessageCompat message) {
        String data = message.getData();
        if (data == null) return;
        try {
            JSONObject request = new JSONObject(data);
            String requestId = request.optString("requestId", "");
            switch (request.optString("type", "")) {
                case "get-push-state" -> reportPushResult(
                    requestId, hasNotificationPermission() && InstallationIdentity.isRegistered(this));
                case "request-notification-permission" -> requestPushPermission(requestId);
                case "revoke-push-device" -> PushRegistrationClient.revoke(
                    this, revoked -> reportPushResult(requestId, !revoked ? InstallationIdentity.isRegistered(this) : false));
                default -> reportPushResult(requestId, false);
            }
        } catch (Exception ignored) {
            // Ignore malformed messages from the page; no native action is performed.
        }
    }

    private void requestPushPermission(String requestId) {
        if (hasNotificationPermission()) {
            registerPushAndReport(requestId);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pendingPushRequestId = requestId;
            InstallationIdentity.markPermissionRequested(this);
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            return;
        }
        reportPushResult(requestId, false);
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void registerPushAndReport(String requestId) {
        if (!FirebaseBootstrap.initialize(this)) {
            reportPushResult(requestId, false);
            return;
        }
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                InstallationIdentity.saveToken(this, token);
                PushRegistrationClient.register(this, registered -> reportPushResult(requestId, registered));
            })
            .addOnFailureListener(ignored -> reportPushResult(requestId, false));
    }

    private void reportPushResult(String requestId, boolean subscribed) {
        try {
            JSONObject detail = new JSONObject()
                .put("requestId", requestId == null ? "" : requestId)
                .put("permission", notificationPermissionState())
                .put("subscribed", subscribed);
            String script = "window.dispatchEvent(new CustomEvent('teameet:native-push-result',{detail:"
                + detail + "}))";
            webView.evaluateJavascript(script, null);
        } catch (Exception ignored) {
            // The web page may have navigated away before the asynchronous result arrives.
        }
    }

    private String notificationPermissionState() {
        if (hasNotificationPermission()) return "granted";
        return InstallationIdentity.wasPermissionRequested(this) ? "denied" : "default";
    }

    private void registerBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack(); else finish();
            }
        });
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        webView.loadUrl(BuildConfig.WEB_ORIGIN + routeFromIntent(intent));
    }

    private String routeFromIntent(Intent intent) {
        if (intent == null) return "/home";
        String route = intent.getStringExtra(TeameetMessagingService.EXTRA_ROUTE);
        if (route == null) route = intent.getStringExtra("route");
        if (route != null) return AllowedNavigation.safeRoute(route);
        Uri data = intent.getData();
        if (!AllowedNavigation.isInternal(data)) return "/home";
        route = data.getEncodedPath();
        if (data.getEncodedQuery() != null) route += "?" + data.getEncodedQuery();
        return AllowedNavigation.safeRoute(route);
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
