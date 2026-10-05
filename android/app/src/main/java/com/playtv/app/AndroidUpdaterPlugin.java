package com.playtv.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "AndroidUpdater")
public class AndroidUpdaterPlugin extends Plugin {
    private static final long MAX_APK_BYTES = 250L * 1024L * 1024L;

    @PluginMethod
    public void install(PluginCall call) {
        if (!hasValidRequest(call)) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            startActivityForResult(call, permissionIntent, "unknownSourcesResult");
            return;
        }

        downloadAndOpenInstaller(call);
    }

    @ActivityCallback
    private void unknownSourcesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Permita a instalação de atualizações e tente novamente.");
            return;
        }
        downloadAndOpenInstaller(call);
    }

    private boolean hasValidRequest(PluginCall call) {
        String apkUrl = call.getString("apkUrl");
        String sha256 = call.getString("sha256");
        if (apkUrl == null || !apkUrl.startsWith("https://") ||
            sha256 == null || !sha256.matches("(?i)^[a-f0-9]{64}$")) {
            call.reject("Dados da atualização inválidos.");
            return false;
        }
        return true;
    }

    private void downloadAndOpenInstaller(PluginCall call) {
        new Thread(() -> {
            File updateDirectory = new File(getContext().getCacheDir(), "updates");
            File temporaryApk = new File(updateDirectory, "play-tv-update.tmp");
            File finalApk = new File(updateDirectory, "play-tv-update.apk");

            try {
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new IllegalStateException("Não foi possível preparar a atualização.");
                }

                URL url = new URL(call.getString("apkUrl"));
                HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(60_000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "PlayTV-Android-Updater/1.1");
                connection.connect();

                int status = connection.getResponseCode();
                long declaredLength = connection.getContentLengthLong();
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException("Servidor de atualização indisponível.");
                }
                if (declaredLength > MAX_APK_BYTES) {
                    throw new IllegalStateException("Arquivo de atualização muito grande.");
                }

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long downloaded = 0L;
                long lastProgressAt = 0L;
                byte[] buffer = new byte[32 * 1024];
                try (InputStream input = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream output = new FileOutputStream(temporaryApk)) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        downloaded += count;
                        if (downloaded > MAX_APK_BYTES) {
                            throw new IllegalStateException("Arquivo de atualização muito grande.");
                        }
                        digest.update(buffer, 0, count);
                        output.write(buffer, 0, count);
                        long now = System.currentTimeMillis();
                        if (now - lastProgressAt > 400L) {
                            emitProgress("downloading", downloaded, declaredLength);
                            lastProgressAt = now;
                        }
                    }
                    output.getFD().sync();
                } finally {
                    connection.disconnect();
                }

                String actualHash = toHex(digest.digest());
                String expectedHash = call.getString("sha256", "").toLowerCase(Locale.US);
                if (!actualHash.equals(expectedHash)) {
                    throw new SecurityException("A verificação de segurança da atualização falhou.");
                }

                if (finalApk.exists() && !finalApk.delete()) {
                    throw new IllegalStateException("Não foi possível substituir a atualização anterior.");
                }
                if (!temporaryApk.renameTo(finalApk)) {
                    throw new IllegalStateException("Não foi possível concluir o download da atualização.");
                }

                getActivity().runOnUiThread(() -> openInstaller(call, finalApk));
            } catch (Exception error) {
                temporaryApk.delete();
                String message = error.getMessage() == null
                    ? "Não foi possível baixar a atualização."
                    : error.getMessage();
                getActivity().runOnUiThread(() -> call.reject(message));
            }
        }, "play-tv-updater").start();
    }

    private void emitProgress(String status, long downloaded, long total) {
        JSObject event = new JSObject();
        event.put("status", status); event.put("downloadedBytes", downloaded); event.put("totalBytes", total);
        event.put("progress", total > 0 ? Math.min(100, downloaded * 100 / total) : -1);
        notifyListeners("updateProgress", event, true);
    }

    private void openInstaller(PluginCall call, File apk) {
        try {
            emitProgress("ready", apk.length(), apk.length());
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setClipData(ClipData.newRawUri("Play TV update", apkUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("O instalador de aplicativos não está disponível neste aparelho.");
                return;
            }

            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("installerOpened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível abrir o instalador da atualização.");
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.US, "%02x", value));
        return result.toString();
    }
}
