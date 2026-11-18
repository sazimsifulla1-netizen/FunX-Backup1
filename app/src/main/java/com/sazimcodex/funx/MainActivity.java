package com.sazimcodex.funx;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.view.View;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int PERMISSIONS=31;
    private static final int PICK_IMAGE=32;
    private static final int REG_LOCATION_PERMISSION=41;
    private static final int REG_NOTIFICATION_PERMISSION=42;
    private static final int APPWISE_LOCATION_PERMISSION=51;
    private static final int APPWISE_NOTIFICATION_PERMISSION=52;

    private WebView browser;
    private ValueCallback<Uri[]> imageChooser;

    private SharedPreferences prefs(){
        return getSharedPreferences(LiveLocationService.STORE,MODE_PRIVATE);
    }

    private boolean hasLocation(){
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackgroundLocation(){
        return Build.VERSION.SDK_INT<29
            || checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasNotifications(){
        return Build.VERSION.SDK_INT<33
            || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasUsageAccess(){
        try{
            AppOpsManager ops=(AppOpsManager)getSystemService(Context.APP_OPS_SERVICE);
            if(ops==null)return false;
            int mode=ops.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                getPackageName()
            );
            return mode==AppOpsManager.MODE_ALLOWED;
        }catch(Exception e){
            return false;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        browser=new WebView(this);
        browser.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        browser.setBackgroundColor(0xff080d20);

        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if("appassets.androidplatform.net".equals(req.getUrl().getHost()))return false;
                try{startActivity(new Intent(Intent.ACTION_VIEW,req.getUrl()));}
                catch(Exception ignored){}
                return true;
            }
        });

        browser.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){
                if(imageChooser!=null)imageChooser.onReceiveValue(null);
                imageChooser=cb;
                try{
                    Intent i=new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("image/*");
                    startActivityForResult(Intent.createChooser(i,"Choose photo"),PICK_IMAGE);
                    return true;
                }catch(Exception e){
                    imageChooser=null;
                    return false;
                }
            }
        });

        WebSettings s=browser.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        browser.addJavascriptInterface(new Bridge(),"FunXNative");
        setContentView(browser);

        try(InputStream source=getAssets().open("index.html");
            ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];
            int n;
            while((n=source.read(buffer))!=-1)output.write(buffer,0,n);
            String html=new String(output.toByteArray(),StandardCharsets.UTF_8);
            browser.loadDataWithBaseURL(
                "https://appassets.androidplatform.net/",
                html,"text/html","UTF-8",null
            );
        }catch(Exception e){
            Toast.makeText(this,"Unable to load FunX interface",Toast.LENGTH_LONG).show();
        }
    }

    private void openService(){
        if(!hasLocation() || !hasNotifications()){
            List<String> missing=new ArrayList<>();
            if(!hasLocation()){
                missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if(!hasNotifications())missing.add(Manifest.permission.POST_NOTIFICATIONS);
            requestPermissions(missing.toArray(new String[0]),PERMISSIONS);
            return;
        }

        if(SecureSession.load(this).isEmpty()
            || !prefs().getBoolean("remote_enabled",false)){
            Toast.makeText(this,"Sign in and enable location sharing first",Toast.LENGTH_LONG).show();
            return;
        }

        try{
            prefs().edit().putBoolean("tracking_requested",true).apply();
            Intent service=new Intent(this,LiveLocationService.class);
            if(Build.VERSION.SDK_INT>=26)startForegroundService(service);
            else startService(service);
        }catch(Exception e){
            prefs().edit().putBoolean("tracking_requested",false).apply();
            Toast.makeText(this,"Cannot start location service",Toast.LENGTH_LONG).show();
        }
    }

    private void startAppwiseMonitor(){
        if(!prefs().getBoolean("appwise_setup_requested",false)
            || !prefs().getBoolean("remote_enabled",false)
            || SecureSession.load(this).isEmpty())return;

        if(!hasLocation() || !hasNotifications()
            || !hasBackgroundLocation() || !hasUsageAccess())return;

        try{
            prefs().edit()
                .putBoolean("appwise_enabled",true)
                .putBoolean("appwise_setup_requested",false)
                .putBoolean("target_app_foreground",false)
                .putBoolean("tracking_requested",false)
                .apply();

            Intent service=new Intent(this,AppUsageMonitorService.class);
            if(Build.VERSION.SDK_INT>=26)startForegroundService(service);
            else startService(service);

            Toast.makeText(this,"Selected-app sharing is enabled",Toast.LENGTH_LONG).show();
        }catch(Exception e){
            prefs().edit()
                .putBoolean("appwise_enabled",false)
                .putBoolean("appwise_setup_requested",true)
                .apply();
            Toast.makeText(this,"Could not start app monitor",Toast.LENGTH_LONG).show();
        }
    }

    // Called only after the user explicitly agrees in the FunX interface.
    private void beginAppwiseSetup(){
        if(SecureSession.load(this).isEmpty()
            || !prefs().getBoolean("remote_enabled",false)){
            Toast.makeText(this,"Please sign in and enable sharing first",Toast.LENGTH_LONG).show();
            return;
        }

        prefs().edit().putBoolean("appwise_setup_requested",true).apply();

        if(!hasLocation()){
            requestPermissions(new String[]{
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            },APPWISE_LOCATION_PERMISSION);
            return;
        }

        if(!hasNotifications()){
            requestPermissions(new String[]{
                Manifest.permission.POST_NOTIFICATIONS
            },APPWISE_NOTIFICATION_PERMISSION);
            return;
        }

        continueAppwiseSetup();
    }

    private void continueAppwiseSetup(){
        if(!hasLocation() || !hasNotifications())return;

        // Android 10+ requires the user to grant background location separately.
        if(!hasBackgroundLocation()){
            Toast.makeText(this,
                "Open App permissions > Location > Allow all the time",
                Toast.LENGTH_LONG).show();
            try{
                Intent i=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:"+getPackageName()));
                startActivity(i);
            }catch(Exception e){
                Toast.makeText(this,"Could not open app settings",Toast.LENGTH_LONG).show();
            }
            return;
        }

        if(!hasUsageAccess()){
            Toast.makeText(this,
                "Find FunX in Usage Access and allow it",
                Toast.LENGTH_LONG).show();
            try{
                startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
            }catch(Exception e){
                Toast.makeText(this,"Could not open Usage Access settings",Toast.LENGTH_LONG).show();
            }
            return;
        }

        startAppwiseMonitor();
    }

    private void registrationPermissionResult(boolean granted){
        if(browser!=null){
            browser.evaluateJavascript(
                "window.funxRegistrationPermissionResult&&window.funxRegistrationPermissionResult("+granted+")",
                null
            );
        }
    }

    private void requestRegistrationNotificationPermission(){
        if(Build.VERSION.SDK_INT>=33&&!hasNotifications()){
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},REG_NOTIFICATION_PERMISSION);
        }else{
            registrationPermissionResult(hasLocation()&&hasNotifications());
        }
    }

    private void requestRegistrationPermissions(){
        if(!hasLocation()){
            requestPermissions(new String[]{
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            },REG_LOCATION_PERMISSION);
        }else{
            requestRegistrationNotificationPermission();
        }
    }

    private void stopTracking(){
        // Send the server stop signal before disabling remote sharing.
        RemoteLocationReporter.notifyStopped(this);

        prefs().edit()
            .putBoolean("tracking_requested",false)
            .putBoolean("remote_enabled",false)
            .putBoolean("appwise_enabled",false)
            .putBoolean("appwise_setup_requested",false)
            .putBoolean("target_app_foreground",false)
            .apply();

        stopService(new Intent(this,LiveLocationService.class));
        stopService(new Intent(this,AppUsageMonitorService.class));
    }

    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){
        super.onRequestPermissionsResult(request,permissions,results);

        if(request==REG_LOCATION_PERMISSION){
            if(hasLocation())requestRegistrationNotificationPermission();
            else registrationPermissionResult(false);
        }else if(request==REG_NOTIFICATION_PERMISSION){
            registrationPermissionResult(hasLocation()&&hasNotifications());
        }else if(request==PERMISSIONS){
            if(hasLocation()&&hasNotifications())openService();
            else Toast.makeText(this,"Location permission denied. Sharing is OFF.",Toast.LENGTH_LONG).show();
        }else if(request==APPWISE_LOCATION_PERMISSION){
            if(hasLocation())continueAppwiseSetup();
            else {
                prefs().edit().putBoolean("appwise_setup_requested",false).apply();
                Toast.makeText(this,"App-wise sharing cancelled. GPS-only sharing remains separate.",Toast.LENGTH_LONG).show();
            }
        }else if(request==APPWISE_NOTIFICATION_PERMISSION){
            if(hasNotifications())continueAppwiseSetup();
            else {
                prefs().edit().putBoolean("appwise_setup_requested",false).apply();
                Toast.makeText(this,"App-wise sharing cancelled. GPS-only sharing remains separate.",Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override protected void onActivityResult(int request,int code,Intent data){
        super.onActivityResult(request,code,data);
        if(request==PICK_IMAGE&&imageChooser!=null){
            imageChooser.onReceiveValue(
                code==RESULT_OK&&data!=null&&data.getData()!=null
                    ?new Uri[]{data.getData()}:null
            );
            imageChooser=null;
        }
    }

    @Override protected void onResume(){
        super.onResume();

        if(browser!=null){
            browser.evaluateJavascript(
                "window.funxNativeAppVisibility&&window.funxNativeAppVisibility(true)",null
            );
        }

        // Resume setup only after the user returns from Android Settings.
        if(prefs().getBoolean("appwise_setup_requested",false)){
            if(hasLocation()&&hasNotifications()
                &&hasBackgroundLocation()&&hasUsageAccess()){
                startAppwiseMonitor();
            }
        }

        // The old GPS-only mode remains separate from selected-app mode.
        if(!prefs().getBoolean("appwise_enabled",false)
            && prefs().getBoolean("tracking_requested",false)
            && prefs().getBoolean("remote_enabled",false)
            && hasLocation()&&hasNotifications()
            && !SecureSession.load(this).isEmpty()){
            openService();
        }
    }

    @Override protected void onPause(){
        if(browser!=null){
            browser.evaluateJavascript(
                "window.funxNativeAppVisibility&&window.funxNativeAppVisibility(false)",null
            );
        }

        // Keep GPS service alive only when selected-app mode was explicitly enabled.
        if(!prefs().getBoolean("appwise_enabled",false)){
            stopService(new Intent(this,LiveLocationService.class));
        }

        super.onPause();
    }

    @Override public void onBackPressed(){
        if(browser==null){super.onBackPressed();return;}
        browser.evaluateJavascript("window.appBack&&window.appBack()",result->{
            if(!"true".equals(result))MainActivity.super.onBackPressed();
        });
    }

    public final class Bridge {
        @JavascriptInterface public String getSavedToken(){
            return SecureSession.load(MainActivity.this);
        }

        @JavascriptInterface public String getSavedServer(){
            return prefs().getString("remote_url","");
        }

        @JavascriptInterface public boolean saveSession(String url,String token){
            if(!RemoteLocationReporter.validUrl(url)
                || token==null||!token.matches("(?i)[0-9a-f]{64}"))return false;
            if(!SecureSession.save(MainActivity.this,token))return false;
            prefs().edit().putString("remote_url",url.replaceAll("/$","")).apply();
            return true;
        }

        @JavascriptInterface public void clearSession(){
            runOnUiThread(()->{
                stopTracking();
                SecureSession.clear(MainActivity.this);
                prefs().edit().remove("remote_url").apply();
            });
        }

        @JavascriptInterface public void requestRegistrationLocationPermission(){
            runOnUiThread(()->requestRegistrationPermissions());
        }

        @JavascriptInterface public void enableTracking(){
            runOnUiThread(()->openService());
        }

        @JavascriptInterface public void disableTracking(){
            runOnUiThread(()->stopTracking());
        }

        @JavascriptInterface public void setRemoteEnabled(boolean enabled){
            prefs().edit().putBoolean("remote_enabled",enabled).apply();
        }

        @JavascriptInterface public void beginAppUsageSetup(){
            runOnUiThread(()->beginAppwiseSetup());
        }

        @JavascriptInterface public String getLocationState(){
            JSONObject o=new JSONObject();
            try{
                o.put("requested",prefs().getBoolean("tracking_requested",false));
                o.put("running",prefs().getBoolean("service_running",false));
                o.put("remoteEnabled",prefs().getBoolean("remote_enabled",false));
                o.put("permission",hasLocation());
                o.put("backgroundPermission",hasBackgroundLocation());
                o.put("usageAccess",hasUsageAccess());
                o.put("appwiseEnabled",prefs().getBoolean("appwise_enabled",false));
                o.put("appwiseSetupRequested",prefs().getBoolean("appwise_setup_requested",false));
                o.put("targetAppForeground",prefs().getBoolean("target_app_foreground",false));
                o.put("latitude",prefs().getString("lat",""));
                o.put("longitude",prefs().getString("lng",""));
                o.put("timestamp",prefs().getLong("updated",0));
                o.put("remoteSent",prefs().getLong("remote_sent",0));
                o.put("remoteError",prefs().getString("remote_error",""));
            }catch(Exception ignored){}
            return o.toString();
        }

        @JavascriptInterface public void openMap(){
            String lat=prefs().getString("lat","");
            String lon=prefs().getString("lng","");
            if(lat.isEmpty()||lon.isEmpty())return;
            runOnUiThread(()->{
                try{
                    startActivity(new Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse("geo:"+lat+","+lon+"?q="+lat+","+lon)
                    ));
                }catch(Exception e){
                    Toast.makeText(MainActivity.this,"Maps app not available",Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface public void dialNumber(String num){
            if(num==null||!num.matches("[+0-9() -]{3,25}"))return;
            runOnUiThread(()->{
                try{
                    startActivity(new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+Uri.encode(num))));
                }catch(Exception ignored){}
            });
        }
    }

    @Override protected void onDestroy(){
        if(browser!=null){
            browser.removeJavascriptInterface("FunXNative");
            browser.destroy();
            browser=null;
        }
        super.onDestroy();
    }
}
