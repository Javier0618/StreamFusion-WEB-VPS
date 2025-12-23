package stream.fusion;

import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler; // IMPORTANTE: Para el delay
import android.os.Looper;  // IMPORTANTE: Para el delay
import android.view.OrientationEventListener;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.inappmessaging.FirebaseInAppMessaging; // IMPORTANTE: Para trigger manual
import android.util.Log;

public class MainActivity extends BridgeActivity {

    private WebChromeClient.CustomViewCallback customViewCallback;
    private View fullscreenView;
    private static final String TAG = "StreamFusion";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    private OrientationEventListener orientationListener;
    private boolean isVideoFullscreen = false;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. MANTENER PANTALLA SIEMPRE ENCENDIDA
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        
        // 2. LOGUEAR ID PARA PRUEBAS
        logFirebaseInstallationId();

        // 3. CONFIGURAR DELAY DE 11 SEGUNDOS PARA IN-APP MESSAGING
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Log.d(TAG, "⏰ Han pasado 11 segundos. Disparando evento In-App...");
            FirebaseInAppMessaging.getInstance().triggerEvent("abrir_app_11s");
        }, 11000); // 11000ms = 11 segundos

        requestNotificationPermission();
        initializeFirebaseMessaging();
        setupOrientationSensor();
    }

    private void logFirebaseInstallationId() {
        FirebaseInstallations.getInstance().getId()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful()) {
                        Log.d(TAG, "🚀 FID para In-App Messaging Test: " + task.getResult());
                    }
                });
    }

    private void setupOrientationSensor() {
        orientationListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int orientation) {
                if (orientation == OrientationEventListener.ORIENTATION_UNKNOWN) return;

                boolean isLandscape = (orientation > 60 && orientation < 120) || (orientation > 240 && orientation < 300);
                boolean isPortrait = (orientation > 340 || orientation < 20);

                if (isLandscape && !isVideoFullscreen) {
                    triggerFullscreenIfVideoExists();
                } 
                else if (isPortrait && isVideoFullscreen) {
                    runOnUiThread(() -> exitFullscreenManual());
                }
            }
        };

        if (orientationListener.canDetectOrientation()) {
            orientationListener.enable();
        }
    }

    private void triggerFullscreenIfVideoExists() {
        getBridge().getWebView().evaluateJavascript(
            "(function() {" +
            "  var modal = document.getElementById('movie-details-modal-container');" +
            "  if (modal && modal.innerHTML.trim() !== '') {" +
                "    var video = modal.querySelector('video') || modal.querySelector('iframe');" +
                "    if (video) {" +
                "       if (video.requestFullscreen) video.requestFullscreen();" +
                "       else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();" +
                "       return 'found';" +
                "    }" +
            "  }" +
            "  return 'not_found';" +
            "})()", 
            result -> {
                if (result != null && result.contains("found")) {
                    Log.d(TAG, "📺 Fullscreen activado por sensor");
                }
            }
        );
    }

    private void exitFullscreenManual() {
        getBridge().getWebView().evaluateJavascript(
            "if (document.exitFullscreen) { document.exitFullscreen(); } " +
            "else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }",
            null
        );
        exitFullscreen();
    }

    @Override
    public void onStart() {
        super.onStart();

        getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                fullscreenView = view;
                customViewCallback = callback;
                isVideoFullscreen = true;

                FrameLayout decorView = (FrameLayout) getWindow().getDecorView();
                decorView.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));

                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                );
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });
    }

    private void exitFullscreen() {
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }

        if (fullscreenView != null) {
            FrameLayout decorView = (FrameLayout) getWindow().getDecorView();
            decorView.removeView(fullscreenView);
            fullscreenView = null;
        }

        isVideoFullscreen = false;
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            exitFullscreenManual();
            return;
        }
        
        try {
            getBridge().getWebView().evaluateJavascript(
                "(function() {" +
                "  var modalContainer = document.getElementById('movie-details-modal-container');" +
                "  if (modalContainer && modalContainer.innerHTML.trim() !== '') {" +
                "    modalContainer.innerHTML = '';" +
                "    document.body.classList.remove('modal-open');" +
                "    return 'closed';" +
                "  }" +
                "  return 'empty';" +
                "})()",
                result -> {
                    if (result != null && result.contains("closed")) {
                        return;
                    }
                    super.onBackPressed();
                }
            );
        } catch (Exception e) {
            super.onBackPressed();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (orientationListener != null) {
            orientationListener.disable();
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            SharedPreferences prefs = getSharedPreferences("StreamFusion", MODE_PRIVATE);
            if (!prefs.getBoolean("notification_permission_asked", false)) {
                if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this,
                            new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, PERMISSION_REQUEST_CODE);
                }
                prefs.edit().putBoolean("notification_permission_asked", true).apply();
            }
        }
    }

    private void initializeFirebaseMessaging() {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful()) {
                    String token = task.getResult();
                    getSharedPreferences("StreamFusion", MODE_PRIVATE).edit().putString("fcmToken", token).apply();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "❌ Error Firebase Messaging: " + e.getMessage());
        }
    }
}