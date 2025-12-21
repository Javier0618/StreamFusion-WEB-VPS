package stream.fusion;

import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import android.util.Log;

public class MainActivity extends BridgeActivity {

    private WebChromeClient.CustomViewCallback customViewCallback;
    private View fullscreenView;
    private static final String TAG = "StreamFusion";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Solicitar permiso de notificaciones la primera vez
        requestNotificationPermission();
        
        // Inicializar Firebase Cloud Messaging
        initializeFirebaseMessaging();
    }

    private void requestNotificationPermission() {
        // Solo solicitar en Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            SharedPreferences prefs = getSharedPreferences("StreamFusion", MODE_PRIVATE);
            boolean hasAskedPermission = prefs.getBoolean("notification_permission_asked", false);
            
            // Si es la primera vez y no tenemos permiso, solicitar
            if (!hasAskedPermission) {
                if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this,
                            new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                            PERMISSION_REQUEST_CODE);
                }
                // Marcar que ya hemos solicitado el permiso
                prefs.edit().putBoolean("notification_permission_asked", true).apply();
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "✅ Permiso de notificaciones concedido");
            } else {
                Log.d(TAG, "❌ Permiso de notificaciones denegado");
            }
        }
    }

    private void initializeFirebaseMessaging() {
        try {
            // Obtener token FCM
            FirebaseMessaging.getInstance().getToken()
                    .addOnCompleteListener(task -> {
                        if (task.isSuccessful()) {
                            String token = task.getResult();
                            Log.d(TAG, "📱 TOKEN FCM: " + token);
                            
                            // Guardar token en SharedPreferences para que JavaScript pueda acceder
                            getSharedPreferences("StreamFusion", MODE_PRIVATE)
                                    .edit()
                                    .putString("fcmToken", token)
                                    .apply();
                        } else {
                            Log.e(TAG, "❌ Error obteniendo token: " + task.getException());
                        }
                    });
            
            Log.d(TAG, "✅ Firebase Messaging inicializado");
        } catch (Exception e) {
            Log.e(TAG, "❌ Error en Firebase: " + e.getMessage());
        }
    }

    @Override
    public void onStart() {
        super.onStart();

        // Configurar el WebChromeClient para fullscreen de video
        getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                fullscreenView = view;
                customViewCallback = callback;

                FrameLayout decorView = (FrameLayout) getWindow().getDecorView();
                decorView.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                ));

                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                Log.d(TAG, "📺 Video fullscreen: landscape");
            }

            @Override
            public void onHideCustomView() {
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }

                if (fullscreenView != null) {
                    FrameLayout decorView = (FrameLayout) getWindow().getDecorView();
                    decorView.removeView(fullscreenView);
                    fullscreenView = null;
                }

                customViewCallback = null;
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                Log.d(TAG, "📱 Video fullscreen: portrait");
            }
        });
    }

    @Override
    public void onBackPressed() {
        Log.d(TAG, "🔙 Botón atrás presionado");
        
        // Si hay un video en fullscreen, salir del fullscreen primero
        if (fullscreenView != null) {
            Log.d(TAG, "📺 Saliendo de fullscreen");
            // Limpiar el fullscreen view
            FrameLayout decorView = (FrameLayout) getWindow().getDecorView();
            decorView.removeView(fullscreenView);
            fullscreenView = null;
            
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
            
            setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            return;
        }
        
        // Cerrar modal si está abierto - IMPORTANTE: No continuar con back() si se cierra
        try {
            getBridge().getWebView().evaluateJavascript(
                "(function() {" +
                "  var modalContainer = document.getElementById('movie-details-modal-container');" +
                "  if (modalContainer && modalContainer.innerHTML.trim() !== '') {" +
                "    console.log('🔙 Cerrando modal desde Android');" +
                "    modalContainer.innerHTML = '';" +
                "    document.body.classList.remove('modal-open');" +
                "    return 'closed';" +
                "  }" +
                "  return 'empty';" +
                "})()",
                result -> {
                    Log.d(TAG, "Modal check result: " + result);
                    // Si el resultado es "closed", significa que se cerró un modal
                    // En este caso, NO llamar a super.onBackPressed()
                    if (result != null && result.contains("closed")) {
                        Log.d(TAG, "✅ Modal cerrado correctamente, navegación atrás detenida");
                        return;
                    }
                    // Si no había modal, proceder con el back normal
                    Log.d(TAG, "📄 No hay modal, procesando navegación atrás normal");
                    super.onBackPressed();
                }
            );
            
        } catch (Exception e) {
            Log.e(TAG, "Error en onBackPressed: " + e.getMessage());
            super.onBackPressed();
        }
    }
}
