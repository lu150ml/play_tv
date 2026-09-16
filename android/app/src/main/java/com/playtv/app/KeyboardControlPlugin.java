package com.playtv.app;

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
        View target = getActivity().getCurrentFocus();
        if (target == null) {
            target = getBridge().getWebView();
        }

        boolean hidden = false;
        if (target != null) {
            InputMethodManager imm = (InputMethodManager) getActivity().getSystemService(Context.INPUT_METHOD_SERVICE);
            hidden = imm != null && imm.hideSoftInputFromWindow(target.getWindowToken(), 0);
            target.clearFocus();
        }

        JSObject result = new JSObject();
        result.put("hidden", hidden);
        call.resolve(result);
    }
}
