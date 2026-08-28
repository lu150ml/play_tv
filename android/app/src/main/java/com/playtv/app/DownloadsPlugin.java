package com.playtv.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.UUID;

@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {
    private static final String UNIQUE_WORK = "playtv-download-active";
    private static WeakReference<DownloadsPlugin> active = new WeakReference<>(null);

    @Override public void load() { active = new WeakReference<>(this); }

    @PluginMethod public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderResult");
    }

    @ActivityCallback private void folderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("A seleção da pasta foi cancelada.", "FOLDER_CANCELLED"); return;
        }
        Uri uri = data.getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            new SecureDownloadStore(getContext()).folder(uri.toString());
            JSObject response = new JSObject(); response.put("selected", true); call.resolve(response);
        } catch (Exception error) { call.reject("Não foi possível usar a pasta escolhida.", "FOLDER_PERMISSION"); }
    }

    @PluginMethod public void list(PluginCall call) { JSObject value = new JSObject(); value.put("items", new SecureDownloadStore(getContext()).publicQueue()); call.resolve(value); }

    @PluginMethod public void start(PluginCall call) {
        String contentId = call.getString("contentId"); String parentId = call.getString("parentId"); String title = call.getString("title"); String kind = call.getString("kind", "movie"); JSArray candidates = call.getArray("candidates");
        SecureDownloadStore store = new SecureDownloadStore(getContext());
        if (store.folder() == null) { call.reject("Escolha uma pasta antes de iniciar o download.", "FOLDER_REQUIRED"); return; }
        if (contentId == null || title == null || candidates == null || candidates.length() == 0) { call.reject("Este conteúdo não possui um arquivo válido para download.", "INVALID_DOWNLOAD"); return; }
        try {
            JSONObject item = new JSONObject(); String id = UUID.randomUUID().toString();
            item.put("id", id); item.put("contentId", contentId); if (parentId != null) item.put("parentId", parentId); item.put("title", title); item.put("kind", kind); item.put("status", "queued"); item.put("candidates", new JSONArray(candidates.toString())); item.put("bytesDownloaded", 0L); item.put("totalBytes", 0L); item.put("progress", 0); item.put("createdAt", System.currentTimeMillis());
            store.upsert(item); scheduleNext(getContext()); emitQueue(); call.resolve(publicItem(store, id));
        } catch (Exception error) { call.reject("Não foi possível adicionar o download à fila.", "QUEUE_ERROR"); }
    }

    @PluginMethod public void pause(PluginCall call) { changeStatus(call, "paused", true); }
    @PluginMethod public void resume(PluginCall call) { changeStatus(call, "queued", false); }
    @PluginMethod public void cancel(PluginCall call) {
        String id = call.getString("id"); if (id == null) { call.reject("Download inválido."); return; }
        SecureDownloadStore store = new SecureDownloadStore(getContext()); JSONObject item = store.find(id);
        if (item == null) { call.reject("Download não encontrado."); return; }
        try { item.put("status", "cancelled"); deleteUri(item.optString("partUri")); item.remove("partUri"); store.upsert(item); WorkManager.getInstance(getContext()).cancelAllWorkByTag(id); emitQueue(); call.resolve(); }
        catch (Exception error) { call.reject("Não foi possível cancelar o download."); }
    }

    @PluginMethod public void delete(PluginCall call) {
        String id = call.getString("id"); if (id == null) { call.reject("Download inválido."); return; }
        SecureDownloadStore store = new SecureDownloadStore(getContext()); JSONObject item = store.find(id);
        try { if (item != null) { deleteUri(item.optString("partUri")); deleteUri(item.optString("fileUri")); } WorkManager.getInstance(getContext()).cancelAllWorkByTag(id); store.remove(id); emitQueue(); call.resolve(); }
        catch (Exception error) { call.reject("Não foi possível excluir o arquivo."); }
    }

    @PluginMethod public void getCompleted(PluginCall call) {
        String contentId = call.getString("contentId", ""); JSONArray queue = new SecureDownloadStore(getContext()).load(); JSObject result = new JSObject();
        for (int index = 0; index < queue.length(); index += 1) { JSONObject item = queue.optJSONObject(index); if (item != null && contentId.equals(item.optString("contentId")) && "completed".equals(item.optString("status"))) { result.put("uri", item.optString("fileUri")); break; } }
        call.resolve(result);
    }

    private void changeStatus(PluginCall call, String status, boolean cancelWork) {
        String id = call.getString("id"); if (id == null) { call.reject("Download inválido."); return; }
        SecureDownloadStore store = new SecureDownloadStore(getContext()); JSONObject item = store.find(id); if (item == null) { call.reject("Download não encontrado."); return; }
        try { item.put("status", status); item.remove("error"); store.upsert(item); if (cancelWork) WorkManager.getInstance(getContext()).cancelAllWorkByTag(id); else scheduleNext(getContext()); emitQueue(); call.resolve(); }
        catch (Exception error) { call.reject("Não foi possível atualizar o download."); }
    }

    private JSObject publicItem(SecureDownloadStore store, String id) {
        JSONArray queue = store.publicQueue();
        for (int index = 0; index < queue.length(); index += 1) {
            JSONObject item = queue.optJSONObject(index);
            if (item != null && id.equals(item.optString("id"))) {
                try { return new JSObject(item.toString()); }
                catch (Exception ignored) { return new JSObject(); }
            }
        }
        return new JSObject();
    }
    private void deleteUri(String value) { if (value == null || value.isEmpty()) return; DocumentFile file = DocumentFile.fromSingleUri(getContext(), Uri.parse(value)); if (file != null) file.delete(); }

    static synchronized void scheduleNext(Context context) {
        SecureDownloadStore store = new SecureDownloadStore(context); JSONArray queue = store.load(); String nextId = null;
        for (int index = 0; index < queue.length(); index += 1) { JSONObject item = queue.optJSONObject(index); if (item != null && "downloading".equals(item.optString("status"))) return; if (nextId == null && item != null && "queued".equals(item.optString("status"))) nextId = item.optString("id"); }
        if (nextId == null) return;
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(DownloadWorker.class).setInputData(new Data.Builder().putString("id", nextId).build()).setConstraints(constraints).addTag(nextId).build();
        WorkManager.getInstance(context).enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, work);
    }

    static void emitQueue() { DownloadsPlugin plugin = active.get(); if (plugin == null) return; JSObject value = new JSObject(); value.put("items", new SecureDownloadStore(plugin.getContext()).publicQueue()); plugin.notifyListeners("queueChanged", value, true); }
}
