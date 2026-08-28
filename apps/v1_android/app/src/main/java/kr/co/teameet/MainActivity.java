package kr.co.teameet;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
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
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebSettingsCompat;
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
                    InstallationIdentity.markOptedIn(this, false);
                    PushRegistrationClient.revoke(
                        this,
                        ignored -> reportPushResult(requestId, false)
                    );
                    return;
                }
                registerPushAndReport(requestId);
            });
        configureWebView();
        setContentView(webView);
        applySystemBarInsets();
        registerBackHandler();
        if (FirebaseBootstrap.initialize(this)) {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                InstallationIdentity.saveToken(this, token);
                if (canRegisterPush()) PushRegistrationClient.register(this);
            });
        }
        webView.loadUrl(BuildConfig.WEB_ORIGIN + routeFromIntent(getIntent()));
    }

    private void applySystemBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(settings, true);
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
                if (AllowedNavigation.isInternal(target)) return false;
                if (!request.isForMainFrame()) return true;
                if (AllowedNavigation.isTrustedAuthProvider(target)) return false;
                openExternal(target);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (AllowedNavigation.isInternal(Uri.parse(url))) {
                    if (canRegisterPush()) {
                        PushRegistrationClient.register(MainActivity.this);
                    } else if (InstallationIdentity.isRegistered(MainActivity.this)) {
                        PushRegistrationClient.revoke(MainActivity.this, ignored -> {});
                    }
                }
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

    private void openExternal(Uri target) {
        if (!AllowedNavigation.isAllowedExternal(target)) return;
        try {
            Intent external;
            if ("intent".equalsIgnoreCase(target.getScheme())) {
                external = Intent.parseUri(target.toString(), Intent.URI_INTENT_SCHEME);
            } else {
                external = new Intent(Intent.ACTION_VIEW, target);
            }
            external.addCategory(Intent.CATEGORY_BROWSABLE);
            external.setComponent(null);
            external.setSelector(null);
            if (external.resolveActivity(getPackageManager()) != null) startActivity(external);
        } catch (Exception ignored) {
            // Unsupported or malformed external links stay closed instead of crashing the shell.
        }
    }

    private void handleNativeMessage(WebMessageCompat message) {
        String data = message.getData();
        if (data == null) return;
        try {
            JSONObject request = new JSONObject(data);
            String requestId = request.optString("requestId", "");
            switch (request.optString("type", "")) {
                case "get-push-state" -> reportPushResult(
                    requestId, canRegisterPush() && InstallationIdentity.isRegistered(this));
                case "request-notification-permission" -> requestPushPermission(requestId);
                case "revoke-push-device" -> {
                    InstallationIdentity.markOptedIn(this, false);
                    PushRegistrationClient.revoke(
                        this,
                        ignored -> reportPushResult(requestId, false)
                    );
                }
                default -> reportPushResult(requestId, false);
            }
        } catch (Exception ignored) {
            // Ignore malformed messages from the page; no native action is performed.
        }
    }

    private void requestPushPermission(String requestId) {
        InstallationIdentity.markOptedIn(this, true);
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
        return PushPermission.isGranted(this);
    }

    private boolean canRegisterPush() {
        return PushPermission.isGranted(this) && InstallationIdentity.isOptedIn(this);
    }

    @Override protected void onResume() {
        super.onResume();
        if (!PushPermission.isGranted(this)) InstallationIdentity.markOptedIn(this, false);
        if (!canRegisterPush() && InstallationIdentity.isRegistered(this)) {
            PushRegistrationClient.revoke(this, ignored -> {});
        }
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
