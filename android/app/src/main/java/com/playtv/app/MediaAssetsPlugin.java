package com.playtv.app;

import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "MediaAssets")
public class MediaAssetsPlugin extends Plugin {
    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private static final long MAX_CACHE_BYTES = 64L * 1024L * 1024L;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);

    @PluginMethod
    public void resolveImage(PluginCall call) {
        JSArray candidates = call.getArray("candidates");
        if (candidates == null || candidates.length() == 0) {
            call.reject("Nenhuma imagem disponível.", "MISSING_IMAGE");
            return;
        }
        executor.execute(() -> {
            for (int index = 0; index < candidates.length(); index += 1) {
                String candidate = candidates.optString(index, "").trim();
                if (!isHttp(candidate)) continue;
                try {
                    CachedImage image = loadImage(candidate);
                    JSObject result = new JSObject();
                    result.put("uri", Uri.fromFile(image.file).toString());
                    call.resolve(result);
                    return;
                } catch (Exception ignored) {}
            }
            call.reject("Não foi possível carregar esta imagem.", "IMAGE_UNAVAILABLE");
        });
    }

    private CachedImage loadImage(String source) throws Exception {
        File directory = new File(getContext().getCacheDir(), "media-images");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("cache");
        String key = sha256(source);
        File body = new File(directory, key + ".bin");
        File type = new File(directory, key + ".type");
        if (body.isFile() && type.isFile()) {
            body.setLastModified(System.currentTimeMillis());
            return new CachedImage(body);
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(source).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(5_000);
        connection.setReadTimeout(8_000);
        connection.setRequestProperty("User-Agent", "PlayTV-Android/1.4");
        connection.setRequestProperty("Accept", "image/avif,image/webp,image/*,*/*;q=0.8");
        URL url = new URL(source);
        connection.setRequestProperty("Referer", url.getProtocol() + "://" + url.getAuthority() + "/");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("http_" + status);
            String mime = connection.getContentType();
            if (mime == null || !mime.toLowerCase().startsWith("image/")) throw new IllegalStateException("format");
            byte[] bytes = readLimited(connection.getInputStream());
            try (FileOutputStream output = new FileOutputStream(body)) { output.write(bytes); }
            try (FileOutputStream output = new FileOutputStream(type)) { output.write(mime.getBytes(StandardCharsets.UTF_8)); }
            trimCache(directory);
            return new CachedImage(body);
        } finally { connection.disconnect(); }
    }

    private byte[] readLimited(InputStream input) throws Exception {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16_384];
            int total = 0;
            int read;
            while ((read = source.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_IMAGE_BYTES) throw new IllegalStateException("large");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private void trimCache(File directory) {
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".bin"));
        if (files == null) return;
        long total = 0L;
        for (File file : files) total += file.length();
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File file : files) {
            if (total <= MAX_CACHE_BYTES) break;
            total -= file.length();
            String key = file.getName().replace(".bin", "");
            file.delete();
            new File(directory, key + ".type").delete();
        }
    }

    private boolean isHttp(String value) {
        try { String protocol = new URL(value).getProtocol(); return "http".equals(protocol) || "https".equals(protocol); }
        catch (Exception ignored) { return false; }
    }

    private String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte item : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", item));
        return result.toString();
    }

    @Override protected void handleOnDestroy() { executor.shutdownNow(); }
    private static class CachedImage { final File file; CachedImage(File file) { this.file = file; } }
}
