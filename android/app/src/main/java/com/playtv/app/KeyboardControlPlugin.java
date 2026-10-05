package com.playtv.app;

import android.app.Activity;
import android.content.Context;
import android.view.View;
import android.view.inputmethod.InputMethodManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KeyboardControl")
public class KeyboardControlPlugin extends Plugin {
    @PluginMethod
    public void hide(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            JSObject result = new JSObject();
            result.put("hidden", false);
            call.resolve(result);
            return;
        }
        // Métodos de plugin rodam fora da thread de UI. Mexer na View
        // (clearFocus) daqui lança CalledFromWrongThreadException e fecha o
        // app — era o crash ao apertar Enter/OK na barra de busca.
        activity.runOnUiThread(() -> {
            boolean hidden = false;
            try {
                View target = activity.getCurrentFocus();
                if (target == null) target = getBridge().getWebView();
                if (target != null) {
                    InputMethodManager imm = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                    hidden = imm != null && imm.hideSoftInputFromWindow(target.getWindowToken(), 0);
                }
            } catch (Exception ignored) {
                hidden = false;
            }
            JSObject result = new JSObject();
            result.put("hidden", hidden);
            call.resolve(result);
        });
    }
}
