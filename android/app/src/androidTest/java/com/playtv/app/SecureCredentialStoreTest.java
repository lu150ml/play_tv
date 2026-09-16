package com.playtv.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecureCredentialStoreTest {
    @Test
    public void encryptsLoadsAndClearsCredentials() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        SecureCredentialStore store = new SecureCredentialStore(context);
        store.clear();
        store.save("https://iptv.example", "viewer", "private-value");

        JSONObject value = store.load();
        assertEquals("https://iptv.example", value.getString("serverUrl"));
        assertEquals("viewer", value.getString("username"));
        assertEquals("private-value", value.getString("password"));

        store.clear();
        assertNull(store.load());
    }
}
