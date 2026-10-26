package com.sazimcodex.funx;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Android Keystore backed token persistence. Tokens never go into plain SharedPreferences. */
public final class SecureSession {
    private static final String ALIAS = "FunXAuthKey_v1";
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("funx_auth",Context.MODE_PRIVATE); }
    private static SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(ks.containsAlias(ALIAS))return (SecretKey)ks.getKey(ALIAS,null);
        KeyGenerator kg=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());return kg.generateKey();
    }
    public static boolean save(Context c,String token) {
        try {Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());byte[] out=cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            prefs(c).edit().putString("token",Base64.encodeToString(out,Base64.NO_WRAP))
                    .putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).apply();return true;
        } catch (Exception e) {return false;}
    }
    public static String load(Context c) {
        try {String value=prefs(c).getString("token",""),iv=prefs(c).getString("iv","");if(value.isEmpty()||iv.isEmpty())return "";
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(iv,Base64.DEFAULT)));
            return new String(cipher.doFinal(Base64.decode(value,Base64.DEFAULT)),StandardCharsets.UTF_8);
        }catch(Exception e){return "";}
    }
    public static void clear(Context c){prefs(c).edit().remove("token").remove("iv").apply();}
}
