package stream.fusion;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class StreamFusionMessagingService extends FirebaseMessagingService {
    private static final String TAG = "FirebaseMessaging";
    private static final String CHANNEL_ID = "streamfusion_notifications";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "📬 Notificación recibida");

        // Crear canal de notificación
        createNotificationChannel();

        // Obtener título y mensaje
        String title = remoteMessage.getNotification() != null ? 
                remoteMessage.getNotification().getTitle() : "StreamFusion";
        String message = remoteMessage.getNotification() != null ? 
                remoteMessage.getNotification().getBody() : "Nueva notificación";

        Log.d(TAG, "Título: " + title);
        Log.d(TAG, "Mensaje: " + message);

        // Mostrar notificación
        showNotification(title, message);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "🔄 Nuevo token: " + token);
        
        // Guardar token en SharedPreferences
        getSharedPreferences("StreamFusion", Context.MODE_PRIVATE)
                .edit()
                .putString("fcmToken", token)
                .apply();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "StreamFusion Notificaciones",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notificaciones de StreamFusion");
            
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void showNotification(String title, String message) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(message)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

        NotificationManager notificationManager = 
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        
        if (notificationManager != null) {
            notificationManager.notify(1, builder.build());
            Log.d(TAG, "✅ Notificación mostrada");
        }
    }
}
