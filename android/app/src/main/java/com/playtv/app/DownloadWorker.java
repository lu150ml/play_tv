package com.playtv.app;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;

import androidx.annotation.NonNull;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.channels.FileChannel;

public class DownloadWorker extends Worker {
    public DownloadWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        String id = getInputData().getString("id");
        if (id == null) return Result.failure();
        SecureDownloadStore store = new SecureDownloadStore(getApplicationContext());
        JSONObject item = store.find(id);
        if (item == null) return Result.failure();
        try {
            item.put("status", "downloading"); item.remove("error"); store.upsert(item); DownloadsPlugin.emitQueue();
            String folderValue = store.folder();
            if (folderValue == null) throw new PublicDownloadException("Escolha uma pasta para os downloads.");
            DocumentFile folder = DocumentFile.fromTreeUri(getApplicationContext(), Uri.parse(folderValue));
            if (folder == null || !folder.canWrite()) throw new PublicDownloadException("A pasta escolhida não permite gravação.");
            DocumentFile part = resolvePart(folder, item);
            long existing = Math.max(0L, part.length());
            JSONArray candidates = item.optJSONArray("candidates");
            if (candidates == null || candidates.length() == 0) throw new PublicDownloadException("O servidor não forneceu um arquivo para baixar.");
            Exception lastError = null;
            for (int index = 0; index < candidates.length(); index += 1) {
                try {
                    downloadCandidate(item, part, candidates.optString(index), existing, store);
                    if (isStopped()) return Result.success();
                    JSONObject latest = store.find(id);
                    if (latest == null || !"downloading".equals(latest.optString("status"))) return Result.success();
                    finalizeFile(latest, part, store);
                    return Result.success();
                }
                catch (PermanentHttpException error) { lastError = error; }
                catch (Exception error) { lastError = error; if (isStopped()) return Result.success(); }
            }
            throw lastError == null ? new PublicDownloadException("Falha de rede durante o download.") : lastError;
        } catch (Exception error) {
            try {
                JSONObject failed = store.find(id);
                if (failed != null && !"paused".equals(failed.optString("status")) && !"cancelled".equals(failed.optString("status"))) {
                    failed.put("status", "error");
                    failed.put("error", error instanceof PublicDownloadException ? error.getMessage() : "Não foi possível concluir o download.");
                    store.upsert(failed);
                }
            } catch (Exception ignored) {}
            DownloadsPlugin.emitQueue();
            return Result.failure();
        } finally { DownloadsPlugin.scheduleNext(getApplicationContext()); }
    }

    private DocumentFile resolvePart(DocumentFile folder, JSONObject item) throws Exception {
        String saved = item.optString("partUri");
        if (!saved.isEmpty()) {
            DocumentFile existing = DocumentFile.fromSingleUri(getApplicationContext(), Uri.parse(saved));
            if (existing != null && existing.exists()) return existing;
        }
        String name = sanitize(item.optString("title", "video")) + "-" + item.optString("id") + ".part";
        DocumentFile part = folder.createFile("application/octet-stream", name);
        if (part == null) throw new PublicDownloadException("Não foi possível criar o arquivo na pasta escolhida.");
        item.put("partUri", part.getUri().toString());
        new SecureDownloadStore(getApplicationContext()).upsert(item);
        return part;
    }

    private void downloadCandidate(JSONObject item, DocumentFile part, String source, long existing, SecureDownloadStore store) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setInstanceFollowRedirects(true); connection.setConnectTimeout(12_000); connection.setReadTimeout(20_000);
        connection.setRequestProperty("User-Agent", "PlayTV-Android/1.4");
        if (existing > 0) connection.setRequestProperty("Range", "bytes=" + existing + "-");
        try {
            int status = connection.getResponseCode();
            if (status == 416 && existing > 0) return;
            if (status == 401 || status == 403 || status == 404) throw new PermanentHttpException("O servidor recusou ou não encontrou este arquivo.");
            if (status < 200 || status >= 300) throw new PublicDownloadException("O servidor respondeu com erro HTTP " + status + ".");
            boolean resumed = status == 206 && existing > 0;
            long contentLength = connection.getContentLengthLong();
            long total = contentLength > 0 ? contentLength + (resumed ? existing : 0L) : 0L;
            if (total > 0 && availableBytes() < total - (resumed ? existing : 0L)) throw new PublicDownloadException("Não há espaço suficiente para este download.");
            try (ParcelFileDescriptor descriptor = getApplicationContext().getContentResolver().openFileDescriptor(part.getUri(), "rw");
                 FileOutputStream output = descriptor == null ? null : new FileOutputStream(descriptor.getFileDescriptor());
                 InputStream input = connection.getInputStream()) {
                if (output == null) throw new PublicDownloadException("Não foi possível abrir o arquivo de destino.");
                FileChannel channel = output.getChannel();
                if (resumed) channel.position(existing); else { channel.truncate(0L); existing = 0L; }
                byte[] buffer = new byte[64 * 1024]; long downloaded = existing; long lastUpdate = 0L; int read;
                while ((read = input.read(buffer)) >= 0) {
                    if (isStopped()) throw new DownloadStoppedException();
                    output.write(buffer, 0, read); downloaded += read;
                    long now = System.currentTimeMillis();
                    if (now - lastUpdate > 600L) {
                        item.put("bytesDownloaded", downloaded); item.put("totalBytes", total);
                        item.put("progress", total > 0 ? Math.min(100, downloaded * 100 / total) : -1);
                        store.upsert(item); DownloadsPlugin.emitQueue(); lastUpdate = now;
                    }
                }
                item.put("bytesDownloaded", downloaded); item.put("totalBytes", total); item.put("progress", 100); store.upsert(item);
            }
        } finally { connection.disconnect(); }
    }

    private void finalizeFile(JSONObject item, DocumentFile part, SecureDownloadStore store) throws Exception {
        String extension = "episode".equals(item.optString("kind")) ? ".mp4" : ".mp4";
        String finalName = sanitize(item.optString("title", "video")) + extension;
        if (!part.renameTo(finalName)) throw new PublicDownloadException("O download terminou, mas o arquivo não pôde ser finalizado.");
        item.put("fileUri", part.getUri().toString()); item.remove("partUri"); item.put("status", "completed"); item.put("progress", 100); item.remove("error");
        store.upsert(item); DownloadsPlugin.emitQueue();
    }

    private long availableBytes() { StatFs stats = new StatFs(getApplicationContext().getFilesDir().getAbsolutePath()); return stats.getAvailableBytes(); }
    private String sanitize(String value) { String clean = value.replaceAll("[\\\\/:*?\"<>|]", "_").trim(); return clean.isEmpty() ? "video" : clean.substring(0, Math.min(90, clean.length())); }
    private static class PublicDownloadException extends Exception { PublicDownloadException(String message) { super(message); } }
    private static class PermanentHttpException extends PublicDownloadException { PermanentHttpException(String message) { super(message); } }
    private static class DownloadStoppedException extends Exception {}
}
