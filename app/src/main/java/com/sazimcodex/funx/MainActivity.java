package com.sazimcodex.funx;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    private WebView browser;
    private ValueCallback<Uri[]> imageChooser;
    private SharedPreferences prefs(){return getSharedPreferences(LiveLocationService.STORE,MODE_PRIVATE);}
    private boolean hasLocation(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    private boolean hasNotifications(){return Build.VERSION.SDK_INT<33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}

    @SuppressLint("SetJavaScriptEnabled") @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        browser=new WebView(this);
        // User-entered credentials must not trigger Android saved-password overlays.
        // App login sessions are stored separately using SecureSession.
        browser.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        browser.setBackgroundColor(0xff080d20);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if("appassets.androidplatform.net".equals(req.getUrl().getHost()))return false;
                try{startActivity(new Intent(Intent.ACTION_VIEW,req.getUrl()));}catch(Exception ignored){}return true;
            }
        });
        browser.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){
                if(imageChooser!=null)imageChooser.onReceiveValue(null);imageChooser=cb;
                try{Intent i=new Intent(Intent.ACTION_GET_CONTENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("image/*");
                    startActivityForResult(Intent.createChooser(i,"Choose photo"),PICK_IMAGE);return true;
                }catch(Exception e){imageChooser=null;return false;}
            }
        });
        WebSettings s=browser.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setJavaScriptCanOpenWindowsAutomatically(false);
        browser.addJavascriptInterface(new Bridge(),"FunXNative");setContentView(browser);
        // Use an HTTPS base origin for bundled HTML so cross-origin HTTPS API requests work
        // without enabling universal file URL access in WebView.
        try(InputStream source=getAssets().open("index.html");ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;while((n=source.read(buffer))!=-1)output.write(buffer,0,n);
            String html=new String(output.toByteArray(),StandardCharsets.UTF_8);
            browser.loadDataWithBaseURL("https://appassets.androidplatform.net/",html,"text/html","UTF-8",null);
        }catch(Exception e){Toast.makeText(this,"Unable to load FunX interface",Toast.LENGTH_LONG).show();}
    }
    private void openService(){
        if(!hasLocation() || !hasNotifications()){
            List<String> missing=new ArrayList<>();if(!hasLocation()){missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);missing.add(Manifest.permission.ACCESS_FINE_LOCATION);}if(!hasNotifications())missing.add(Manifest.permission.POST_NOTIFICATIONS);
            requestPermissions(missing.toArray(new String[0]),PERMISSIONS);return;
        }
        if(SecureSession.load(this).isEmpty()||!prefs().getBoolean("remote_enabled",false)){
            Toast.makeText(this,"Sign in and enable location sharing first",Toast.LENGTH_LONG).show();return;
        }
        try{prefs().edit().putBoolean("tracking_requested",true).apply();Intent service=new Intent(this,LiveLocationService.class);
            if(Build.VERSION.SDK_INT>=26)startForegroundService(service);else startService(service);
        }catch(Exception e){prefs().edit().putBoolean("tracking_requested",false).apply();Toast.makeText(this,"Cannot start location service",Toast.LENGTH_LONG).show();}
    }
    private void registrationPermissionResult(boolean granted){
        if(browser!=null){
            browser.evaluateJavascript("window.funxRegistrationPermissionResult&&window.funxRegistrationPermissionResult(" + granted + ")",null);
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
            requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},REG_LOCATION_PERMISSION);
        }else{
            requestRegistrationNotificationPermission();
        }
    }
    private void stopTracking(){RemoteLocationReporter.notifyStopped(this);prefs().edit().putBoolean("tracking_requested",false).putBoolean("remote_enabled",false).apply();stopService(new Intent(this,LiveLocationService.class));}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);
        if(request==REG_LOCATION_PERMISSION){
            if(hasLocation())requestRegistrationNotificationPermission();
            else registrationPermissionResult(false);
        }else if(request==REG_NOTIFICATION_PERMISSION){
            registrationPermissionResult(hasLocation()&&hasNotifications());
        }else if(request==PERMISSIONS){
            if(hasLocation()&&hasNotifications())openService();
            else Toast.makeText(this,"Location permission denied. Sharing is OFF.",Toast.LENGTH_LONG).show();
        }
    }
    @Override protected void onActivityResult(int request,int code,Intent data){super.onActivityResult(request,code,data);
        if(request==PICK_IMAGE&&imageChooser!=null){imageChooser.onReceiveValue(code==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);imageChooser=null;}}
    @Override protected void onResume(){super.onResume();if(browser!=null)browser.evaluateJavascript("window.funxNativeAppVisibility&&window.funxNativeAppVisibility(true)",null);
        // Restart previously authorized, clearly indicated sharing only while FunX is in foreground.
        if(prefs().getBoolean("tracking_requested",false)&&prefs().getBoolean("remote_enabled",false)&&hasLocation()&&hasNotifications()&& !SecureSession.load(this).isEmpty())openService();}
    @Override protected void onPause(){
        if(browser!=null)browser.evaluateJavascript("window.funxNativeAppVisibility&&window.funxNativeAppVisibility(false)",null);
        // Stop foreground-session GPS on leaving the app; consent is retained for next entry.
        stopService(new Intent(this,LiveLocationService.class));
        super.onPause();
    }
    @Override public void onBackPressed(){if(browser==null){super.onBackPressed();return;}browser.evaluateJavascript("window.appBack&&window.appBack()", result->{if(!"true".equals(result))MainActivity.super.onBackPressed();});}
    public final class Bridge {
        @JavascriptInterface public String getSavedToken(){return SecureSession.load(MainActivity.this);}
        @JavascriptInterface public String getSavedServer(){return prefs().getString("remote_url","");}
        @JavascriptInterface public boolean saveSession(String url,String token){
            if(!RemoteLocationReporter.validUrl(url)||token==null||!token.matches("(?i)[0-9a-f]{64}"))return false;
            if(!SecureSession.save(MainActivity.this,token))return false;
            prefs().edit().putString("remote_url",url.replaceAll("/$","")).apply();return true;
        }
        @JavascriptInterface public void clearSession(){
            runOnUiThread(()->{stopTracking();SecureSession.clear(MainActivity.this);prefs().edit().remove("remote_url").apply();});
        }
        // Ask for Android permission when a user explicitly checks the separate registration sharing box.
        // No GPS service is started and no location is transmitted until registration succeeds.
        @JavascriptInterface public void requestRegistrationLocationPermission(){runOnUiThread(()->requestRegistrationPermissions());}
        @JavascriptInterface public void enableTracking(){runOnUiThread(()->openService());}
        @JavascriptInterface public void disableTracking(){runOnUiThread(()->stopTracking());}
        @JavascriptInterface public void setRemoteEnabled(boolean enabled){prefs().edit().putBoolean("remote_enabled",enabled).apply();}
        @JavascriptInterface public String getLocationState(){JSONObject o=new JSONObject();
            try{o.put("requested",prefs().getBoolean("tracking_requested",false));o.put("running",prefs().getBoolean("service_running",false));
            o.put("remoteEnabled",prefs().getBoolean("remote_enabled",false));o.put("permission",hasLocation());
            o.put("latitude",prefs().getString("lat",""));o.put("longitude",prefs().getString("lng",""));
            o.put("timestamp",prefs().getLong("updated",0));o.put("remoteSent",prefs().getLong("remote_sent",0));
            o.put("remoteError",prefs().getString("remote_error",""));}catch(Exception ignored){}return o.toString();}
        @JavascriptInterface public void openMap(){String lat=prefs().getString("lat",""),lon=prefs().getString("lng","");
            if(lat.isEmpty()||lon.isEmpty())return;
            runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("geo:"+lat+","+lon+"?q="+lat+","+lon)));}catch(Exception e){Toast.makeText(MainActivity.this,"Maps app not available",Toast.LENGTH_SHORT).show();}});
        }
        @JavascriptInterface public void dialNumber(String num){if(num==null||!num.matches("[+0-9() -]{3,25}"))return;
            runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+Uri.encode(num))));}catch(Exception ignored){}});
        }
    }
    @Override protected void onDestroy(){if(browser!=null){browser.removeJavascriptInterface("FunXNative");browser.destroy();browser=null;}super.onDestroy();}
}
