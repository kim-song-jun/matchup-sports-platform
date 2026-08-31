package kr.co.teameet;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
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
    private FrameLayout rootView;
    private WebView webView;
    private View webErrorView;
    private ValueCallback<Uri[]> pendingFileChooser;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<String> notificationPermissionLauncher;
    private ActivityResultLauncher<String> locationPermissionLauncher;
    private GeolocationPermissions.Callback pendingLocationCallback;
    private String pendingLocationOrigin;
    private String pendingPushRequestId;
    private int bottomSystemInsetCssPixels;
    private int keyboardInsetCssPixels;
    private boolean keyboardVisible;

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
                    revokePushAndDeleteToken(() -> reportPushResult(requestId, false));
                    return;
                }
                registerPushAndReport(requestId);
            });
        locationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            this::completeLocationPermissionRequest);
        configureWebView();
        configureRootView();
        setContentView(rootView);
        applySystemBarInsets();
        registerBackHandler();
        if (FirebaseBootstrap.initialize(this) && canRegisterPush()) {
            FirebaseMessaging.getInstance().setAutoInitEnabled(true);
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                InstallationIdentity.saveToken(this, token);
                PushRegistrationClient.register(this);
            });
        }
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(BuildConfig.WEB_ORIGIN + routeFromIntent(getIntent()));
        }
    }

    private void applySystemBarInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            keyboardVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            // Keep the WebView edge-to-edge at the bottom so fixed web chrome can paint behind the
            // navigation bar. Only its interactive content consumes the bottom inset via the CSS
            // variable below; padding the native root on all four sides makes the whole web viewport
            // float above three-button navigation.
            // Edge-to-edge WebViews do not consistently shrink their CSS viewport for the IME even
            // with adjustResize. Shrink the native content box only while the keyboard is visible;
            // normal web/browser layout and the edge-to-edge navigation surface stay unchanged.
            view.setPadding(insets.left, insets.top, insets.right, keyboardVisible ? imeInsets.bottom : 0);
            float density = getResources().getDisplayMetrics().density;
            bottomSystemInsetCssPixels = Math.round(insets.bottom / density);
            keyboardInsetCssPixels = keyboardVisible ? Math.round(imeInsets.bottom / density) : 0;
            publishSystemInsets();
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(rootView);
    }

    private void configureRootView() {
        rootView = new FrameLayout(this);
        rootView.addView(webView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
        webErrorView = createWebErrorView();
        rootView.addView(webErrorView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }

    private View createWebErrorView() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        container.setBackgroundColor(Color.WHITE);
        int padding = Math.round(32 * getResources().getDisplayMetrics().density);
        container.setPadding(padding, padding, padding, padding);
        container.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText(R.string.web_error_title);
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        container.addView(title);

        TextView description = new TextView(this);
        description.setText(R.string.web_error_description);
        description.setTextColor(Color.rgb(75, 85, 99));
        description.setTextSize(15);
        description.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        descriptionParams.topMargin = Math.round(12 * getResources().getDisplayMetrics().density);
        container.addView(description, descriptionParams);

        Button retry = new Button(this);
        retry.setText(R.string.web_error_retry);
        retry.setOnClickListener(view -> webView.reload());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        retryParams.topMargin = Math.round(20 * getResources().getDisplayMetrics().density);
        container.addView(retry, retryParams);
        return container;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        // Alpha devices expose the embedded page to chrome://inspect for font/network diagnostics.
        // The production flavor hard-disables this independently of the Android build type.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.WEBVIEW_DEBUGGING_ENABLED);
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
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                hideWebError();
            }
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
                    publishSystemInsets();
                    if (canRegisterPush()) {
                        PushRegistrationClient.register(MainActivity.this);
                    } else if (InstallationIdentity.isRegistered(MainActivity.this)) {
                        revokePushAndDeleteToken(() -> {});
                    }
                }
            }
            @Override public void onReceivedError(
                WebView view, WebResourceRequest request, WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) showWebError();
            }
            @Override public void onReceivedHttpError(
                WebView view, WebResourceRequest request, WebResourceResponse response
            ) {
                super.onReceivedHttpError(view, request, response);
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showWebError();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(
                WebView view, ValueCallback<Uri[]> callback, FileChooserParams params
            ) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = callback;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                } catch (Exception ignored) {
                    pendingFileChooser.onReceiveValue(null);
                    pendingFileChooser = null;
                    Toast.makeText(MainActivity.this, R.string.file_chooser_failed, Toast.LENGTH_LONG).show();
                }
                return true;
            }
            @Override public void onGeolocationPermissionsShowPrompt(
                String origin, GeolocationPermissions.Callback callback
            ) {
                requestLocationPermission(origin, callback);
            }
            @Override public void onGeolocationPermissionsHidePrompt() {
                completeLocationPermissionRequest(false);
            }
        });
        webView.setDownloadListener(this::enqueueInternalDownload);
    }

    private void hideWebError() {
        if (webErrorView != null) webErrorView.setVisibility(View.GONE);
    }

    private void showWebError() {
        if (webErrorView != null) webErrorView.setVisibility(View.VISIBLE);
    }

    private void requestLocationPermission(
        String origin, GeolocationPermissions.Callback callback
    ) {
        if (!AllowedNavigation.isInternalOrigin(origin)) {
            callback.invoke(origin, false, false);
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED) {
            callback.invoke(origin, true, false);
            return;
        }
        completeLocationPermissionRequest(false);
        pendingLocationOrigin = origin;
        pendingLocationCallback = callback;
        locationPermissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private void completeLocationPermissionRequest(boolean granted) {
        GeolocationPermissions.Callback callback = pendingLocationCallback;
        String origin = pendingLocationOrigin;
        pendingLocationCallback = null;
        pendingLocationOrigin = null;
        if (callback != null) callback.invoke(origin, granted, false);
    }

    private void publishSystemInsets() {
        if (webView == null) return;
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--teameet-native-safe-bottom','"
                + bottomSystemInsetCssPixels
                + "px');document.documentElement.style.setProperty('--v1-shell-safe-bottom','"
                + bottomSystemInsetCssPixels + "px')",
            null
        );
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty(\"--teameet-native-keyboard-inset\",\""
                + keyboardInsetCssPixels
                + "px\");document.documentElement.dataset.teameetNativeKeyboard=\""
                + (keyboardVisible ? "open" : "closed")
                + "\"",
            null
        );
    }

    private void enqueueInternalDownload(
        String url,
        String userAgent,
        String contentDisposition,
        String mimeType,
        long contentLength
    ) {
        if (!AllowedNavigation.isInternalAbsoluteUrl(url)) {
            showDownloadFailure();
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType))
                .setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                );
            if (mimeType != null && !mimeType.isBlank()) request.setMimeType(mimeType);
            String cookie = CookieManager.getInstance().getCookie(BuildConfig.WEB_ORIGIN);
            if (cookie != null && !cookie.isBlank()) request.addRequestHeader("Cookie", cookie);
            if (userAgent != null && !userAgent.isBlank()) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            getSystemService(DownloadManager.class).enqueue(request);
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {
            showDownloadFailure();
        }
    }

    private void showDownloadFailure() {
        Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show();
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
            try {
                startActivity(external);
                return;
            } catch (ActivityNotFoundException ignored) {
                // The reviewed Play fallback below is the only recovery path for missing map apps.
            }
            String fallbackUrl = AllowedNavigation.externalAppStoreFallback(target);
            if (fallbackUrl != null) {
                Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                fallback.addCategory(Intent.CATEGORY_BROWSABLE);
                try {
                    startActivity(fallback);
                    return;
                } catch (ActivityNotFoundException ignored) {
                    // Surface the same honest unavailable state when no browser or Play Store can open it.
                }
            }
            Toast.makeText(this, R.string.external_app_unavailable, Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {
            Toast.makeText(this, R.string.external_app_unavailable, Toast.LENGTH_LONG).show();
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
                case "open-notification-settings" -> openNotificationSettings(requestId);
                case "revoke-push-device" -> {
                    InstallationIdentity.markOptedIn(this, false);
                    revokePushAndDeleteToken(() -> reportPushResult(requestId, false));
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

    private void openNotificationSettings(String requestId) {
        try {
            Intent settingsIntent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(settingsIntent);
        } catch (Exception primaryFailure) {
            try {
                startActivity(new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())
                ));
            } catch (Exception ignored) {
                // The Web UI keeps the manual settings instructions visible.
            }
        }
        reportPushResult(
            requestId,
            canRegisterPush() && InstallationIdentity.isRegistered(this)
        );
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
            revokePushAndDeleteToken(() -> {});
        }
    }

    private void registerPushAndReport(String requestId) {
        if (!FirebaseBootstrap.initialize(this)) {
            reportPushResult(requestId, false);
            return;
        }
        FirebaseMessaging.getInstance().setAutoInitEnabled(true);
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                InstallationIdentity.saveToken(this, token);
                PushRegistrationClient.register(this, registered -> reportPushResult(requestId, registered));
            })
            .addOnFailureListener(ignored -> reportPushResult(requestId, false));
    }

    private void revokePushAndDeleteToken(Runnable completion) {
        boolean firebaseReady = FirebaseBootstrap.initialize(this);
        FirebaseMessaging messaging = firebaseReady ? FirebaseMessaging.getInstance() : null;
        if (messaging != null) messaging.setAutoInitEnabled(false);
        InstallationIdentity.clearToken(this);
        InstallationIdentity.markRegistered(this, false);
        PushRegistrationClient.revoke(this, ignored -> {
            if (messaging == null) {
                completion.run();
                return;
            }
            messaging.deleteToken().addOnCompleteListener(task -> {
                completion.run();
            });
        });
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
        String route = explicitRouteFromIntent(intent);
        // singleTask delivers a plain MAIN/LAUNCHER intent when the user reopens the running app.
        // It has no destination and must leave the current WebView page/history untouched. FCM and
        // verified App Links still carry an explicit route and intentionally navigate here.
        if (route != null) webView.loadUrl(BuildConfig.WEB_ORIGIN + route);
    }

    private String routeFromIntent(Intent intent) {
        String explicitRoute = explicitRouteFromIntent(intent);
        return explicitRoute == null ? "/home" : explicitRoute;
    }

    private String explicitRouteFromIntent(Intent intent) {
        if (intent == null) return null;
        String route = intent.getStringExtra(TeameetMessagingService.EXTRA_ROUTE);
        if (route == null) route = intent.getStringExtra("route");
        if (route != null) return AllowedNavigation.safeRoute(route);
        Uri data = intent.getData();
        if (data == null) return null;
        if (!AllowedNavigation.isInternal(data)) return "/home";
        route = data.getEncodedPath();
        if (data.getEncodedQuery() != null) route += "?" + data.getEncodedQuery();
        return AllowedNavigation.safeRoute(route);
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override protected void onDestroy() {
        completeLocationPermissionRequest(false);
        if (pendingFileChooser != null) {
            pendingFileChooser.onReceiveValue(null);
            pendingFileChooser = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
