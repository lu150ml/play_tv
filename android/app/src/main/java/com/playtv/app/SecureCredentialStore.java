package com.playtv.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class SecureCredentialStore {
    private static final String ALIAS = "play_tv_credentials_key";
    private static final String PREFS = "play_tv_secure_credentials";
    private static final String VALUE = "encrypted_value";
    private static final String IV = "initialization_vector";
    private final Context context;

    public SecureCredentialStore(Context context) {
        this.context = context.getApplicationContext();
    }

    public void save(String serverUrl, String username, String password) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("serverUrl", serverUrl);
        payload.put("username", username);
        payload.put("password", password);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
        prefs().edit()
            .putString(VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .apply();
    }

    public JSONObject load() throws Exception {
        String encryptedValue = prefs().getString(VALUE, null);
        String encodedIv = prefs().getString(IV, null);
        if (encryptedValue == null || encodedIv == null) return null;

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = Base64.decode(encodedIv, Base64.NO_WRAP);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        byte[] decrypted = cipher.doFinal(Base64.decode(encryptedValue, Base64.NO_WRAP));
        return new JSONObject(new String(decrypted, StandardCharsets.UTF_8));
    }

    public void clear() {
        prefs().edit().clear().apply();
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }
}
