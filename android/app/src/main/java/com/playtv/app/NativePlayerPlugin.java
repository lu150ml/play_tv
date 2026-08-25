package com.playtv.app;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String contentId = call.getString("contentId");
        String streamUrl = call.getString("streamUrl");
        if (contentId == null || streamUrl == null) {
            call.reject("Missing media identifier or stream URL.");
            return;
        }

        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("contentId", contentId);
        intent.putExtra("title", call.getString("title", "Play TV"));
        intent.putExtra("streamUrl", streamUrl);
        intent.putExtra("kind", call.getString("kind", "movie"));
        intent.putExtra("startPositionMs", call.getLong("startPositionMs", 0L));
        intent.putExtra("posterUrl", call.getString("posterUrl"));
        intent.putExtra("subtitleApiBaseUrl", call.getString("subtitleApiBaseUrl"));

        JSArray nextEpisodes = call.getArray("nextEpisodes");
        JSObject subtitleQuery = call.getObject("subtitleQuery");
        intent.putExtra("nextEpisodes", nextEpisodes == null ? "[]" : nextEpisodes.toString());
        intent.putExtra("subtitleQuery", subtitleQuery == null ? "{}" : subtitleQuery.toString());
        startActivityForResult(call, intent, "playerResult");
    }

    @ActivityCallback
    private void playerResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        Intent data = activityResult.getData();
        if (data == null) {
            call.reject("Native player closed without a result.");
            return;
        }

        JSObject result = new JSObject();
        result.put("contentId", data.getStringExtra("contentId"));
        result.put("positionMs", data.getLongExtra("positionMs", 0L));
        result.put("durationMs", data.getLongExtra("durationMs", 0L));
        result.put("completed", data.getBooleanExtra("completed", false));
        result.put("reason", data.getStringExtra("reason"));
        String errorCode = data.getStringExtra("errorCode");
        if (errorCode != null) result.put("errorCode", errorCode);
        String progress = data.getStringExtra("progress");
        if (progress != null) {
            try {
                result.put("progress", new JSArray(progress));
            } catch (Exception ignored) {}
        }
        call.resolve(result);
    }
}
