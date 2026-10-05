package com.playtv.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "SecureCredentials")
public class SecureCredentialsPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String serverUrl = call.getString("serverUrl");
        String username = call.getString("username");
        String password = call.getString("password");
        if (serverUrl == null || username == null || password == null) {
            call.reject("Missing connection fields.");
            return;
        }

        try {
            new SecureCredentialStore(getContext()).save(serverUrl, username, password);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not store credentials securely.");
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        JSObject result = new JSObject();
        SecureCredentialStore store = new SecureCredentialStore(getContext());
        try {
            JSONObject value = store.load();
            if (value != null) result.put("value", new JSObject(value.toString()));
        } catch (Exception error) {
            store.clear();
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        new SecureCredentialStore(getContext()).clear();
        call.resolve();
    }
}
