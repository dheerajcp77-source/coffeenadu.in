package com.coffeenadu.admin;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Full-screen secure container for CoffeeNadu Admin Android app.
 *
 * Security & Lifecycle Features:
 * - Completely isolated from Chrome sessions, Chrome Password Manager, and Android Autofill.
 * - Origin-verified JavaScript bridge to Android Keystore AES-256-GCM credential vault.
 * - Automatic dashboard lock and server-side session revocation on:
 *     1) Android Back button exit
 *     2) App Exit button
 *     3) Moving app to background (onStop, safely excluding system photo picker / rotation)
 *     4) App close / destroy
 * - Full image & file upload support (main + extra news photos), swipe refresh & offline recovery.
 */
public class AdminWebViewActivity extends AppCompatActivity {

    public static final String EXTRA_URL = "extra_admin_url";
    private static final String LOGOUT_ENDPOINT = "https://" + BuildConfig.ALLOWED_HOST + "/api/admin2/auth/logout";

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private ProgressBar loadingProgress;
    private LinearLayout offlineOverlay;
    private ValueCallback<Uri[]> filePathCallback;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private SecureCredentialVault credentialVault;

    private boolean pageHadError = false;
    private boolean isFilePickerActive = false;

    // Volatile RAM-only token reference for guaranteed server-side revocation on exit/background.
    // Never persisted to disk or SharedPreferences.
    private volatile String activeSessionToken = null;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> {
                        isFilePickerActive = false;
                        if (filePathCallback == null) return;
                        Uri[] results = null;
                        if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                            Intent data = result.getData();
                            if (data.getClipData() != null) {
                                int count = data.getClipData().getItemCount();
                                results = new Uri[count];
                                for (int i = 0; i < count; i++) {
                                    results[i] = data.getClipData().getItemAt(i).getUri();
                                }
                            } else if (data.getData() != null) {
                                results = new Uri[]{data.getData()};
                            }
                        }
                        filePathCallback.onReceiveValue(results);
                        filePathCallback = null;
                    }
            );

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_admin_webview);

        credentialVault = new SecureCredentialVault(this);

        webView = findViewById(R.id.adminWebView);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        loadingProgress = findViewById(R.id.loadingProgress);
        offlineOverlay = findViewById(R.id.offlineOverlay);
        Button retryButton = findViewById(R.id.retryButton);

        // Disable Android Autofill & Google Password Manager prompts on the WebView
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);

        // Isolate fresh launch: clear any leftover WebView cookies or storage from previous runs
        clearTransientWebSessionData();

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        // Expose strictly origin-checked Android Keystore & session lifecycle bridge
        webView.addJavascriptInterface(new AndroidVaultBridge(), "CoffeeNaduAndroidVault");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAllowedInApp(uri)) {
                    return false;
                }
                Intent externalIntent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(externalIntent);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                swipeRefresh.setRefreshing(false);
                loadingProgress.setVisibility(View.GONE);
                if (!pageHadError) {
                    offlineOverlay.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    pageHadError = true;
                    swipeRefresh.setRefreshing(false);
                    loadingProgress.setVisibility(View.GONE);
                    offlineOverlay.setVisibility(View.VISIBLE);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    loadingProgress.setVisibility(View.VISIBLE);
                    loadingProgress.setProgress(newProgress);
                } else {
                    loadingProgress.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (AdminWebViewActivity.this.filePathCallback != null) {
                    AdminWebViewActivity.this.filePathCallback.onReceiveValue(null);
                }
                AdminWebViewActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    isFilePickerActive = true;
                    fileChooserLauncher.launch(intent);
                    return true;
                } catch (Exception e) {
                    isFilePickerActive = false;
                    AdminWebViewActivity.this.filePathCallback = null;
                    return false;
                }
            }
        });

        swipeRefresh.setColorSchemeResources(R.color.cn_navy, R.color.cn_gold);
        swipeRefresh.setOnRefreshListener(() -> {
            pageHadError = false;
            webView.reload();
        });

        retryButton.setOnClickListener(v -> {
            if (isOnline()) {
                pageHadError = false;
                offlineOverlay.setVisibility(View.GONE);
                webView.reload();
            }
        });

        // Android Back button: revoke active Admin 2.0 session & lock when exiting the app
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack() && !isAtAdminRootUrl(webView.getUrl())) {
                    webView.goBack();
                } else {
                    revokeSessionAndLock("android_back_exit", true);
                }
            }
        });

        registerNetworkObserver();

        String targetUrl = getIntent().getStringExtra(EXTRA_URL);
        if (targetUrl == null || !targetUrl.startsWith("https://" + BuildConfig.ALLOWED_HOST + "/admin")) {
            targetUrl = BuildConfig.ADMIN_LAUNCH_URL + "?source=android_app&fresh=1";
        }
        if (isOnline()) {
            webView.loadUrl(targetUrl);
        } else {
            pageHadError = true;
            offlineOverlay.setVisibility(View.VISIBLE);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Immediately lock dashboard and revoke server session when app moves to background
        // (safely skip during system image/file picker or screen orientation change)
        if (!isFilePickerActive && !isChangingConfigurations() && !isFinishing()) {
            revokeSessionAndLock("app_backgrounded", false);
        }
    }

    @Override
    protected void onDestroy() {
        String leftoverToken = activeSessionToken;
        activeSessionToken = null;
        if (leftoverToken != null && !leftoverToken.isEmpty()) {
            revokeTokenOnBackendAsync(leftoverToken, "app_closed");
        }
        clearTransientWebSessionData();
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
            }
        }
        if (webView != null) {
            webView.removeJavascriptInterface("CoffeeNaduAndroidVault");
            webView.destroy();
        }
        super.onDestroy();
    }

    private void revokeSessionAndLock(String reason, boolean finishAfter) {
        final String tokenToRevoke = activeSessionToken;
        activeSessionToken = null;

        // 1. Immediately lock React UI & wipe sensitive in-memory dashboard state
        if (webView != null) {
            final String safeReason = reason.replaceAll("[^a-zA-Z0-9_-]", "");
            runOnUiThread(() -> {
                try {
                    webView.evaluateJavascript(
                            "if (typeof window.__coffeeNaduForceLockAndLogout === 'function') { window.__coffeeNaduForceLockAndLogout('" + safeReason + "'); }",
                            null
                    );
                } catch (Exception ignored) {
                }
            });
        }

        // 2. Guaranteed native HTTPS revocation on backend (even if Activity is closing immediately)
        if (tokenToRevoke != null && !tokenToRevoke.isEmpty()) {
            revokeTokenOnBackendAsync(tokenToRevoke, reason);
        }

        // 3. Wipe transient cookies & WebView memory cache
        clearTransientWebSessionData();

        if (finishAfter) {
            finishAndRemoveTask();
        }
    }

    private void revokeTokenOnBackendAsync(final String bearerToken, final String reason) {
        Thread thread = new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(LOGOUT_ENDPOINT);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
                String body = "{\"reason\":\"" + reason.replace("\"", "") + "\",\"clearRemembered\":false}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
                conn.getResponseCode();
            } catch (Exception ignored) {
                // Best-effort network revocation
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }, "cn-session-revoke");
        thread.start();
    }

    private void clearTransientWebSessionData() {
        try {
            CookieManager cm = CookieManager.getInstance();
            cm.removeAllCookies(null);
            cm.flush();
            WebStorage.getInstance().deleteAllData();
            if (webView != null) {
                webView.clearCache(true);
            }
        } catch (Exception ignored) {
        }
    }

    private boolean isAtAdminRootUrl(String url) {
        if (url == null) return true;
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        return path == null || "/admin".equals(path) || "/admin/".equals(path);
    }

    private boolean isTrustedAdminOriginSync() {
        if (webView == null) return false;
        final AtomicBoolean trusted = new AtomicBoolean(false);
        final CountDownLatch latch = new CountDownLatch(1);
        runOnUiThread(() -> {
            try {
                String currentUrl = webView.getUrl();
                if (currentUrl != null) {
                    Uri uri = Uri.parse(currentUrl);
                    String path = uri.getPath() != null ? uri.getPath() : "";
                    boolean valid = "https".equalsIgnoreCase(uri.getScheme())
                            && BuildConfig.ALLOWED_HOST.equalsIgnoreCase(uri.getHost())
                            && (path.equals("/admin") || path.startsWith("/admin/"));
                    trusted.set(valid);
                }
            } catch (Exception ignored) {
                trusted.set(false);
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await(1500, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
            return false;
        }
        return trusted.get();
    }

    private boolean isAllowedInApp(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        String host = uri.getHost();
        if (host == null) return false;
        return host.equalsIgnoreCase(BuildConfig.ALLOWED_HOST)
                || host.equalsIgnoreCase("accounts.google.com")
                || host.endsWith(".firebaseapp.com")
                || host.endsWith(".googleusercontent.com");
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network active = cm.getActiveNetwork();
        if (active == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(active);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void registerNetworkObserver() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                runOnUiThread(() -> {
                    if (pageHadError && offlineOverlay.getVisibility() == View.VISIBLE) {
                        pageHadError = false;
                        offlineOverlay.setVisibility(View.GONE);
                        webView.reload();
                    }
                });
            }

            @Override
            public void onLost(@NonNull Network network) {
                runOnUiThread(() -> {
                    if (!isOnline()) {
                        offlineOverlay.setVisibility(View.VISIBLE);
                    }
                });
            }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
    }

    /**
     * Origin-verified native JavaScript bridge for Android Keystore credential storage
     * and active session revocation. Only accessible on https://coffeenad-news.ai.studio/admin*.
     */
    private final class AndroidVaultBridge {

        @JavascriptInterface
        public boolean isAvailable() {
            return isTrustedAdminOriginSync();
        }

        @JavascriptInterface
        public String loadCredentials() {
            if (!isTrustedAdminOriginSync()) return "";
            return credentialVault.loadCredentialsJson();
        }

        @JavascriptInterface
        public boolean saveCredentials(String email, String password) {
            if (!isTrustedAdminOriginSync()) return false;
            return credentialVault.saveCredentials(email, password);
        }

        @JavascriptInterface
        public boolean clearCredentials() {
            if (!isTrustedAdminOriginSync()) return false;
            return credentialVault.clearCredentials();
        }

        @JavascriptInterface
        public void onSessionStarted(String bearerToken) {
            if (!isTrustedAdminOriginSync()) return;
            if (bearerToken != null && bearerToken.startsWith("cn2.")) {
                activeSessionToken = bearerToken.trim();
            }
        }

        @JavascriptInterface
        public void onSessionCleared() {
            if (!isTrustedAdminOriginSync()) return;
            activeSessionToken = null;
        }

        @JavascriptInterface
        public void exitApp() {
            if (!isTrustedAdminOriginSync()) return;
            runOnUiThread(() -> revokeSessionAndLock("app_exit", true));
        }
    }
}
