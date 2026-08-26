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

import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {
    private static WeakReference<NativePlayerPlugin> activePlugin = new WeakReference<>(null);

    @Override
    public void load() {
        activePlugin = new WeakReference<>(this);
    }

    public static void emitState(
        String state,
        String contentId,
        long positionMs,
        long durationMs,
        String errorCode
    ) {
        NativePlayerPlugin plugin = activePlugin.get();
        if (plugin == null) return;
        JSObject event = new JSObject();
        event.put("state", state);
        event.put("contentId", contentId);
        event.put("positionMs", positionMs);
        event.put("durationMs", durationMs);
        if (errorCode != null) event.put("errorCode", errorCode);
        plugin.notifyListeners("playerStateChanged", event, true);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String contentId = call.getString("contentId");
        String streamUrl = call.getString("streamUrl");
        if (contentId == null || streamUrl == null) {
            call.reject("Missing media identifier or stream URL.");
            return;
        }
        if (PlayerActivity.hasActivePlayer()) {
            call.reject("Já existe um vídeo em reprodução.", "PLAYER_ACTIVE");
            return;
        }

        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra("contentId", contentId);
        intent.putExtra("title", call.getString("title", "Play TV"));
        intent.putExtra("streamUrl", streamUrl);
        JSArray streamCandidates = call.getArray("streamCandidates");
        intent.putExtra("streamCandidates", streamCandidates == null ? "[]" : streamCandidates.toString());
        intent.putExtra("kind", call.getString("kind", "movie"));
        intent.putExtra("startPositionMs", call.getLong("startPositionMs", 0L));
        intent.putExtra("season", call.getInt("season", 0));
        intent.putExtra("episode", call.getInt("episode", 0));
        intent.putExtra("posterUrl", call.getString("posterUrl"));
        intent.putExtra("subtitleApiBaseUrl", call.getString("subtitleApiBaseUrl"));

        JSArray nextEpisodes = call.getArray("nextEpisodes");
        JSArray playlist = call.getArray("playlist");
        JSObject subtitleQuery = call.getObject("subtitleQuery");
        intent.putExtra("nextEpisodes", nextEpisodes == null ? "[]" : nextEpisodes.toString());
        intent.putExtra("playlist", playlist == null ? "[]" : playlist.toString());
        intent.putExtra("subtitleQuery", subtitleQuery == null ? "{}" : subtitleQuery.toString());
        startActivityForResult(call, intent, "playerResult");
    }

    @PluginMethod
    public void close(PluginCall call) {
        String reason = call.getString("reason", "back");
        getActivity().runOnUiThread(() -> {
            boolean closed = PlayerActivity.requestClose(reason);
            JSObject result = new JSObject();
            result.put("closed", closed);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void isActive(PluginCall call) {
        JSObject result = new JSObject();
        result.put("active", PlayerActivity.hasActivePlayer());
        call.resolve(result);
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
