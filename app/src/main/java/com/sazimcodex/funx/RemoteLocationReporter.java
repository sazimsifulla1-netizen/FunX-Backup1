package com.sazimcodex.funx;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Sends location only when user has actively enabled sharing. */
public final class RemoteLocationReporter {
    private static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
    private static final AtomicBoolean IN_FLIGHT=new AtomicBoolean();
    private static long lastAttempt=0;
    private RemoteLocationReporter(){}
    public static boolean validUrl(String v){if(v==null||v.length()>240||!v.startsWith("https://"))return false;
        try{URL u=new URL(v);return "https".equals(u.getProtocol())&&!u.getHost().isEmpty()&&u.getUserInfo()==null
                &&(u.getPath().isEmpty()||u.getPath().equals("/"))&&u.getQuery()==null&&u.getRef()==null;}catch(Exception e){return false;}}
    private static SharedPreferences pref(Context c){return c.getApplicationContext().getSharedPreferences(LiveLocationService.STORE,Context.MODE_PRIVATE);}
    public static void upload(Context c,Location l){SharedPreferences p=pref(c);if(!p.getBoolean("tracking_requested",false)||!p.getBoolean("remote_enabled",false)||!validUrl(p.getString("remote_url","")))return;
        long now=SystemClock.elapsedRealtime();if((lastAttempt!=0&&now-lastAttempt<30000)||!IN_FLIGHT.compareAndSet(false,true))return;lastAttempt=now;
        Context app=c.getApplicationContext();double lat=l.getLatitude(),lng=l.getLongitude();float acc=l.hasAccuracy()?l.getAccuracy():0;
        NETWORK.execute(()->{try{SharedPreferences r=pref(app);if(!r.getBoolean("tracking_requested",false)||!r.getBoolean("remote_enabled",false))return;
            JSONObject b=new JSONObject();b.put("latitude",lat);b.put("longitude",lng);b.put("accuracy",acc);
            int code=send(app,r.getString("remote_url",""),"/api/location",b);
            if(code>=200&&code<300)r.edit().putLong("remote_sent",System.currentTimeMillis()).putString("remote_error","").apply();
            else r.edit().putString("remote_error","Server HTTP "+code).apply();
        }catch(Exception e){p.edit().putString("remote_error","Connection failed; check internet or server").apply();}finally{IN_FLIGHT.set(false);}});
    }
    public static void notifyStopped(Context c){SharedPreferences p=pref(c);if(!p.getBoolean("remote_enabled",false))return;
        Context app=c.getApplicationContext();String url=p.getString("remote_url","");NETWORK.execute(()->{try{send(app,url,"/api/stop",new JSONObject());}catch(Exception ignored){}});
    }
    private static int send(Context context,String root,String endpoint,JSONObject obj)throws Exception{
        String token=SecureSession.load(context);if(!validUrl(root)||!token.matches("(?i)[0-9a-f]{64}"))return -1;
        HttpURLConnection conn=null;try{conn=(HttpURLConnection)new URL(root.replaceAll("/$","")+endpoint).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(10000);conn.setReadTimeout(12000);
            conn.setRequestMethod("POST");conn.setRequestProperty("Content-Type","application/json; charset=utf-8");conn.setRequestProperty("Authorization","Bearer "+token);conn.setDoOutput(true);
            byte[] bytes=obj.toString().getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(bytes.length);
            try(OutputStream out=conn.getOutputStream()){out.write(bytes);}return conn.getResponseCode();
        }finally{if(conn!=null)conn.disconnect();}
    }
}
