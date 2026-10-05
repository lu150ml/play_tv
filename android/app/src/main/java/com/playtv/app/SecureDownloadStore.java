package com.playtv.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class SecureDownloadStore {
    private static final String ALIAS = "play_tv_downloads_key";
    private static final String PREFS = "play_tv_downloads";
    private static final String VALUE = "queue";
    private static final String IV = "queue_iv";
    private static final String FOLDER = "folder_uri";
    private final Context context;

    public SecureDownloadStore(Context context) { this.context = context.getApplicationContext(); }

    public synchronized JSONArray load() {
        try {
            String value = prefs().getString(VALUE, null);
            String iv = prefs().getString(IV, null);
            if (value == null || iv == null) return new JSONArray();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            return new JSONArray(new String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), StandardCharsets.UTF_8));
        } catch (Exception ignored) { return new JSONArray(); }
    }

    public synchronized void save(JSONArray queue) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(queue.toString().getBytes(StandardCharsets.UTF_8));
        prefs().edit().putString(VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).apply();
    }

    public synchronized JSONObject find(String id) {
        JSONArray queue = load();
        for (int index = 0; index < queue.length(); index += 1) {
            JSONObject item = queue.optJSONObject(index);
            if (item != null && id.equals(item.optString("id"))) return item;
        }
        return null;
    }

    public synchronized void upsert(JSONObject item) throws Exception {
        JSONArray queue = load();
        JSONArray next = new JSONArray();
        boolean replaced = false;
        for (int index = 0; index < queue.length(); index += 1) {
            JSONObject current = queue.optJSONObject(index);
            if (current != null && item.optString("id").equals(current.optString("id"))) {
                next.put(item); replaced = true;
            } else if (current != null) next.put(current);
        }
        if (!replaced) next.put(item);
        save(next);
    }

    public synchronized void remove(String id) throws Exception {
        JSONArray queue = load(); JSONArray next = new JSONArray();
        for (int index = 0; index < queue.length(); index += 1) {
            JSONObject current = queue.optJSONObject(index);
            if (current != null && !id.equals(current.optString("id"))) next.put(current);
        }
        save(next);
    }

    public String folder() { return prefs().getString(FOLDER, null); }
    public void folder(String value) { prefs().edit().putString(FOLDER, value).apply(); }

    public JSONArray publicQueue() {
        JSONArray source = load(); JSONArray result = new JSONArray();
        for (int index = 0; index < source.length(); index += 1) {
            JSONObject item = source.optJSONObject(index); if (item == null) continue;
            JSONObject value = new JSONObject();
            try {
                for (String key : new String[]{"id","contentId","parentId","title","kind","status","bytesDownloaded","totalBytes","progress","error","createdAt"}) {
                    if (item.has(key)) value.put(key, item.get(key));
                }
                value.put("playable", "completed".equals(item.optString("status")) && !item.optString("fileUri").isEmpty());
            } catch (Exception ignored) {}
            result.put(value);
        }
        return result;
    }

    private SharedPreferences prefs() { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
}
