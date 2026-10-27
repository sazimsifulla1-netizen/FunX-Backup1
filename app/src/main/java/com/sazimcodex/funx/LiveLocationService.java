package com.sazimcodex.funx;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import java.util.Locale;

public final class LiveLocationService extends Service implements LocationListener {
    public static final String STORE = "funx_location";
    private static final String CHANNEL = "location_visible";
    private static final int NOTIFICATION_ID = 2901;
    private static final String ACTION_STOP = "com.sazimcodex.funx.STOP_LOCATION";
    private LocationManager manager;
    private boolean gpsListening;
    private boolean networkListening;
    private boolean attemptedRecentFix;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager notifications = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (notifications != null && Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Live Location", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Visible notification for your active location sharing session");
            notifications.createNotificationChannel(channel);
        }
    }

    private boolean allowed() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private Notification notification(String details) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stopIntent = new Intent(this, LiveLocationService.class).setAction(ACTION_STOP);
        PendingIntent stopAction = PendingIntent.getService(this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setContentTitle("FunX · Live Location Active")
                .setContentText(details)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(pending)
                .setOnlyAlertOnce(true)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop Sharing", stopAction).build())
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            RemoteLocationReporter.notifyStopped(this);
            getSharedPreferences(STORE, MODE_PRIVATE).edit()
                    .putBoolean("tracking_requested", false).putBoolean("remote_enabled", false).apply();
            stopSelf(); return START_NOT_STICKY;
        }
        if (!getSharedPreferences(STORE, MODE_PRIVATE).getBoolean("tracking_requested", false) || !allowed()) {
            getSharedPreferences(STORE, MODE_PRIVATE).edit().putBoolean("service_running", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification starting = notification("Updating location · Open FunX to stop");
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, starting, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, starting);
            }
            getSharedPreferences(STORE, MODE_PRIVATE).edit().putBoolean("service_running", true).apply();
            startUpdates();
            return START_STICKY;
        } catch (SecurityException | IllegalStateException e) {
            getSharedPreferences(STORE, MODE_PRIVATE).edit()
                    .putBoolean("service_running", false).putBoolean("tracking_requested", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
    }

    private void startUpdates() {
        if (manager == null) manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (manager == null || !allowed()) return;
        try {
            if (!gpsListening && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000L, 5f, this, Looper.getMainLooper());
                gpsListening = true;
            }
            if (!networkListening && manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 5f, this, Looper.getMainLooper());
                networkListening = true;
            }
            // A fresh cached fix improves first-registration delivery latency; never forward stale coordinates.
            if (!attemptedRecentFix) {
                attemptedRecentFix=true;
                Location recent=null;
                if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) recent=manager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    Location network=manager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                    if (network!=null&&(recent==null||network.getElapsedRealtimeNanos()>recent.getElapsedRealtimeNanos())) recent=network;
                }
                if (recent!=null && recent.getElapsedRealtimeNanos()>0
                        && SystemClock.elapsedRealtimeNanos()-recent.getElapsedRealtimeNanos()<120000000000L) {
                    onLocationChanged(recent);
                }
            }
            if (!gpsListening && !networkListening) updateNotification("Please enable Android location services");
        } catch (SecurityException e) {
            getSharedPreferences(STORE, MODE_PRIVATE).edit().putBoolean("tracking_requested", false).apply();
            stopSelf();
        }
    }

    private void updateNotification(String message) {
        NotificationManager n = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (n != null) n.notify(NOTIFICATION_ID, notification(message));
    }

    @Override public void onLocationChanged(Location location) {
        getSharedPreferences(STORE, MODE_PRIVATE).edit()
                .putString("lat", String.format(Locale.US,"%.7f", location.getLatitude()))
                .putString("lng", String.format(Locale.US,"%.7f", location.getLongitude()))
                .putFloat("accuracy", location.getAccuracy())
                .putLong("updated", System.currentTimeMillis())
                .apply();
        boolean sharing = getSharedPreferences(STORE, MODE_PRIVATE).getBoolean("remote_enabled", false)
                && RemoteLocationReporter.validUrl(getSharedPreferences(STORE, MODE_PRIVATE).getString("remote_url", ""));
        updateNotification((sharing ? "Location sharing active · " : "GPS active · ")
                + Math.round(location.getAccuracy()) + " m accuracy");
        RemoteLocationReporter.upload(this, location);
    }

    @Override public void onProviderEnabled(String provider) { startUpdates(); }
    @Override public void onProviderDisabled(String provider) {
        if (manager == null) return;
        boolean gps = manager.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean network = manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        if (!gps && !network) updateNotification("Location is off · Enable Android location");
    }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override public void onDestroy() {
        if (manager != null) {
            try { manager.removeUpdates(this); } catch (Exception ignored) {}
        }
        gpsListening = false;
        networkListening = false;
        getSharedPreferences(STORE, MODE_PRIVATE).edit().putBoolean("service_running", false).apply();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
