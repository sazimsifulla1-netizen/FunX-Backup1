package com.sazimcodex.funx;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import android.util.Log;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class AppUsageMonitorService extends Service {

    private static final String TAG = "FunXAppMonitor";
    private static final String CHANNEL = "funx_app_monitor";
    private static final int NOTIFICATION_ID = 2902;
    private static final String ACTION_STOP =
            "com.sazimcodex.funx.STOP_APP_MONITOR";

    private static final Set<String> TARGETS = new HashSet<>(Arrays.asList(
            "com.facebook.katana",
            "com.facebook.orca",
            "com.whatsapp",
            "com.whatsapp.w4b"
    ));

    private final Handler handler = new Handler(Looper.getMainLooper());

    private long lastEventTime;
    private String foregroundPackage = "";
    private boolean monitoring = false;

    private SharedPreferences prefs() {
        return getSharedPreferences(LiveLocationService.STORE, MODE_PRIVATE);
    }

    private boolean hasUsageAccess() {
        try {
            AppOpsManager ops =
                    (AppOpsManager) getSystemService(APP_OPS_SERVICE);

            return ops != null && ops.checkOpNoThrow(
                    AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(),
                    getPackageName()
            ) == AppOpsManager.MODE_ALLOWED;

        } catch (Exception e) {
            Log.e(TAG, "Usage access check failed", e);
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();

        if (!prefs().getBoolean("appwise_enabled", false)
                || !hasUsageAccess()) {
            stopSelf();
            return;
        }

        createNotificationChannel();

        try {
            Notification notification = buildNotification(
                    "Monitoring selected apps"
            );

            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }

            monitoring = true;

            // Reconstruct recent foreground state once at startup.
            long now = System.currentTimeMillis();
            lastEventTime = Math.max(0, now - 24L * 60L * 60L * 1000L);

            readUsageEvents(now, true);
            lastEventTime = now;

            applyForegroundState();

            handler.postDelayed(monitorTask, 2500L);

        } catch (Exception e) {
            Log.e(TAG, "Could not start monitor", e);
            stopSharing();
        }
    }

    private final Runnable monitorTask = new Runnable() {
        @Override
        public void run() {
            if (!monitoring) return;

            if (!prefs().getBoolean("appwise_enabled", false)
                    || !hasUsageAccess()) {
                stopSharing();
                return;
            }

            readUsageEvents(System.currentTimeMillis(), false);
            applyForegroundState();

            if (monitoring) {
                handler.postDelayed(this, 2500L);
            }
        }
    };

    private void readUsageEvents(long now, boolean startup) {
        try {
            UsageStatsManager usage =
                    (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);

            if (usage == null) return;

            long from = startup ? lastEventTime : lastEventTime + 1;
            UsageEvents events = usage.queryEvents(from, now);

            if (events == null) return;

            UsageEvents.Event event = new UsageEvents.Event();

            while (events.hasNextEvent()) {
                events.getNextEvent(event);

                lastEventTime = Math.max(
                        lastEventTime,
                        event.getTimeStamp()
                );

                String pkg = event.getPackageName();
                if (pkg == null) continue;

                int type = event.getEventType();

                boolean resumed =
                        type == UsageEvents.Event.ACTIVITY_RESUMED
                        || type == UsageEvents.Event.MOVE_TO_FOREGROUND;

                boolean paused =
                        type == UsageEvents.Event.ACTIVITY_PAUSED
                        || type == UsageEvents.Event.ACTIVITY_STOPPED
                        || type == UsageEvents.Event.MOVE_TO_BACKGROUND;

                if (resumed) {
                    foregroundPackage = pkg;
                } else if (paused && pkg.equals(foregroundPackage)) {
                    foregroundPackage = "";
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Usage event reading failed", e);
        }
    }

    private void applyForegroundState() {
        boolean selected = TARGETS.contains(foregroundPackage);
        boolean wasSelected =
                prefs().getBoolean("target_app_foreground", false);

        if (selected && !wasSelected) {
            Log.d(TAG, "Selected app foreground: " + foregroundPackage);

            prefs().edit()
                    .putBoolean("target_app_foreground", true)
                    .putBoolean("tracking_requested", true)
                    .apply();

            Intent location = new Intent(this, LiveLocationService.class);

            if (Build.VERSION.SDK_INT >= 26) {
                startForegroundService(location);
            } else {
                startService(location);
            }

            updateNotification(
                    "Sharing location for " + displayName(foregroundPackage)
            );

        } else if (!selected && wasSelected) {
            Log.d(TAG, "No selected app in foreground");

            RemoteLocationReporter.notifyStopped(this);

            prefs().edit()
                    .putBoolean("target_app_foreground", false)
                    .putBoolean("tracking_requested", false)
                    .apply();

            stopService(new Intent(this, LiveLocationService.class));

            updateNotification("Monitoring selected apps");
        }
    }

    private String displayName(String pkg) {
        if (pkg == null) return "Selected app";
        if (pkg.contains("whatsapp")) return "WhatsApp";
        if (pkg.contains("orca")) return "Messenger";
        if (pkg.contains("facebook")) return "Facebook";
        return "Selected app";
    }

    private Notification buildNotification(String message) {
        Intent open = new Intent(this, MainActivity.class);

        PendingIntent openPending = PendingIntent.getActivity(
                this,
                10,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT
                        | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stop = new Intent(this, AppUsageMonitorService.class);
        stop.setAction(ACTION_STOP);

        PendingIntent stopPending = PendingIntent.getService(
                this,
                11,
                stop,
                PendingIntent.FLAG_UPDATE_CURRENT
                        | PendingIntent.FLAG_IMMUTABLE
        );

        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("FunX · App-wise Sharing")
                .setContentText(message)
                .setContentIntent(openPending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .addAction(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        "Stop Sharing",
                        stopPending
                )
                .build();
    }

    private void updateNotification(String message) {
        NotificationManager manager =
                getSystemService(NotificationManager.class);

        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(message));
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager =
                    getSystemService(NotificationManager.class);

            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL,
                        "FunX Selected App Sharing",
                        NotificationManager.IMPORTANCE_LOW
                );

                channel.setDescription(
                        "Visible notification while app-wise sharing is enabled"
                );

                manager.createNotificationChannel(channel);
            }
        }
    }

    private void stopSharing() {
        monitoring = false;
        handler.removeCallbacks(monitorTask);

        RemoteLocationReporter.notifyStopped(this);

        prefs().edit()
                .putBoolean("appwise_enabled", false)
                .putBoolean("appwise_setup_requested", false)
                .putBoolean("target_app_foreground", false)
                .putBoolean("tracking_requested", false)
                .putBoolean("remote_enabled", false)
                .apply();

        stopService(new Intent(this, LiveLocationService.class));

        stopForeground(true);
        stopSelf();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSharing();
            return START_NOT_STICKY;
        }

        if (!prefs().getBoolean("appwise_enabled", false)
                || !hasUsageAccess()) {
            stopSharing();
            return START_NOT_STICKY;
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        monitoring = false;
        handler.removeCallbacks(monitorTask);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
