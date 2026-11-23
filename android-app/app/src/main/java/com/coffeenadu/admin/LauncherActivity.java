package com.coffeenadu.admin;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;

/**
 * Primary entry point for CoffeeNadu Admin Android application.
 *
 * Preserves the package name (com.coffeenadu.admin), splash screen, app icon,
 * Digital Asset Links verification, and verified HTTPS /admin deep-link routing,
 * while launching AdminWebViewActivity so the app:
 * 1. Never inherits an authenticated Chrome browser session or Chrome Password Manager.
 * 2. Uses Android Keystore-backed AES-256-GCM encryption for app-controlled Remember Me.
 * 3. Automatically locks the dashboard and revokes the server session on Back exit,
 *    Exit App, backgrounding, or closing the app.
 */
public class LauncherActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        Uri launchUri = resolveFreshAdminLaunchUri(getIntent());
        Intent intent = new Intent(this, AdminWebViewActivity.class);
        intent.putExtra(AdminWebViewActivity.EXTRA_URL, launchUri.toString());
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }

    private Uri resolveFreshAdminLaunchUri(Intent incomingIntent) {
        Uri baseUri = Uri.parse(BuildConfig.ADMIN_LAUNCH_URL);
        Uri incoming = incomingIntent != null ? incomingIntent.getData() : null;
        if (incoming != null
                && "https".equalsIgnoreCase(incoming.getScheme())
                && BuildConfig.ALLOWED_HOST.equalsIgnoreCase(incoming.getHost())
                && incoming.getPath() != null
                && incoming.getPath().startsWith("/admin")) {
            baseUri = incoming;
        }

        return baseUri.buildUpon()
                .appendQueryParameter("source", "android_app")
                .appendQueryParameter("fresh", "1")
                .build();
    }
}
