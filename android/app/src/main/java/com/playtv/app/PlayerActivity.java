package com.playtv.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PlayerActivity extends AppCompatActivity {
    private static final int MAX_RETRIES = 3;
    private static final long SAVE_INTERVAL_MS = 10_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, ProgressEntry> progress = new LinkedHashMap<>();
    private ExoPlayer player;
    private PlayerView playerView;
    private String currentId;
    private String lastMediaId;
    private int retryCount;
    private boolean resultSent;

    private final Runnable progressSaver = new Runnable() {
        @Override
        public void run() {
            captureProgress(false);
            handler.postDelayed(this, SAVE_INTERVAL_MS);
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        playerView = new PlayerView(this);
        playerView.setBackgroundColor(android.graphics.Color.BLACK);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        playerView.setControllerAutoShow(true);
        playerView.setControllerHideOnTouch(true);
        playerView.setControllerShowTimeoutMs(5_000);
        playerView.setShowSubtitleButton(true);
        playerView.setShowNextButton(true);
        setContentView(playerView);

        Intent intent = getIntent();
        currentId = intent.getStringExtra("contentId");
        String subtitleBase = sanitizeHttpBase(intent.getStringExtra("subtitleApiBaseUrl"));
        String subtitleQuery = intent.getStringExtra("subtitleQuery");

        if (subtitleBase != null && subtitleQuery != null && !"{}".equals(subtitleQuery)) {
            executor.execute(() -> {
                List<MediaItem.SubtitleConfiguration> subtitles = fetchSubtitles(subtitleBase, subtitleQuery);
                runOnUiThread(() -> initializePlayer(subtitles));
            });
        } else {
            initializePlayer(new ArrayList<>());
        }
    }

    private void initializePlayer(List<MediaItem.SubtitleConfiguration> subtitles) {
        if (isFinishing() || isDestroyed()) return;

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .setUsage(C.USAGE_MEDIA)
            .build();

        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(audioAttributes, true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.setHandleAudioBecomingNoisy(true);
        playerView.setPlayer(player);

        List<MediaItem> playlist = buildPlaylist(subtitles);
        if (playlist.isEmpty()) {
            finishWithResult("error", "missing_media", false);
            return;
        }

        player.setMediaItems(playlist);
        long startPosition = Math.max(0L, getIntent().getLongExtra("startPositionMs", 0L));
        player.seekTo(0, startPosition);
        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                String nextId = mediaItem == null ? currentId : mediaItem.mediaId;
                if (lastMediaId != null && !lastMediaId.equals(nextId)) {
                    ProgressEntry previous = progress.get(lastMediaId);
                    if (previous != null) previous.completed = true;
                }
                lastMediaId = nextId;
                currentId = nextId;
                retryCount = 0;
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) retryCount = 0;
                if (state == Player.STATE_ENDED) {
                    captureProgress(true);
                    handler.postDelayed(() -> finishWithResult("ended", null, true), 500L);
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (retryCount < MAX_RETRIES) {
                    long delay = (long) Math.pow(2, retryCount) * 1_000L;
                    retryCount += 1;
                    handler.postDelayed(() -> {
                        if (player == null) return;
                        player.prepare();
                        player.play();
                    }, delay);
                    return;
                }

                finishWithResult("error", safeErrorCode(error), false);
            }
        });
        player.prepare();
        player.play();
        handler.postDelayed(progressSaver, SAVE_INTERVAL_MS);
    }

    private List<MediaItem> buildPlaylist(List<MediaItem.SubtitleConfiguration> subtitles) {
        List<MediaItem> result = new ArrayList<>();
        Intent intent = getIntent();
        result.add(buildMediaItem(
            intent.getStringExtra("contentId"),
            intent.getStringExtra("title"),
            intent.getStringExtra("streamUrl"),
            intent.getStringExtra("kind"),
            subtitles
        ));

        try {
            JSONArray next = new JSONArray(intent.getStringExtra("nextEpisodes"));
            for (int index = 0; index < next.length(); index += 1) {
                JSONObject item = next.getJSONObject(index);
                result.add(buildMediaItem(
                    item.optString("contentId"),
                    item.optString("title"),
                    item.optString("streamUrl"),
                    item.optString("kind", "episode"),
                    new ArrayList<>()
                ));
            }
        } catch (Exception ignored) {}
        return result;
    }

    private MediaItem buildMediaItem(
        String id,
        String title,
        String streamUrl,
        String kind,
        List<MediaItem.SubtitleConfiguration> subtitles
    ) {
        MediaItem.Builder builder = new MediaItem.Builder()
            .setMediaId(id == null ? "media" : id)
            .setUri(streamUrl)
            .setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder().setTitle(title).build())
            .setSubtitleConfigurations(subtitles);

        if ("live".equals(kind) || (streamUrl != null && streamUrl.toLowerCase().contains(".m3u8"))) {
            builder.setMimeType(MimeTypes.APPLICATION_M3U8);
        }
        return builder.build();
    }

    private List<MediaItem.SubtitleConfiguration> fetchSubtitles(String baseUrl, String queryJson) {
        List<MediaItem.SubtitleConfiguration> result = new ArrayList<>();
        try {
            JSONObject query = new JSONObject(queryJson);
            StringBuilder path = new StringBuilder(baseUrl).append("/api/subtitles?query=")
                .append(URLEncoder.encode(query.optString("title"), "UTF-8"));
            if (query.has("season")) path.append("&season=").append(query.optInt("season"));
            if (query.has("episode")) path.append("&episode=").append(query.optInt("episode"));

            JSONArray entries = new JSONArray(readLimited(path.toString(), 512 * 1024));
            for (int index = 0; index < Math.min(entries.length(), 12); index += 1) {
                JSONObject entry = entries.getJSONObject(index);
                String fileId = entry.optString("fileId");
                if (fileId.isEmpty()) continue;
                Uri uri = Uri.parse(baseUrl + "/api/subtitles/file?fileId=" +
                    URLEncoder.encode(fileId, "UTF-8"));
                result.add(new MediaItem.SubtitleConfiguration.Builder(uri)
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(entry.optString("language", "pt"))
                    .setLabel(entry.optString("release", "Legenda"))
                    .build());
            }
        } catch (Exception ignored) {
            // External subtitles are optional and never block playback.
        }
        return result;
    }

    private String readLimited(String urlValue, int maxBytes) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlValue).openConnection();
        connection.setConnectTimeout(4_000);
        connection.setReadTimeout(6_000);
        connection.setRequestProperty("Accept", "application/json");
        if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) {
            connection.disconnect();
            throw new IllegalStateException("Subtitle service unavailable.");
        }

        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8_192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("Subtitle response too large.");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        } finally {
            connection.disconnect();
        }
    }

    private String sanitizeHttpBase(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        try {
            URL url = new URL(value.trim());
            if (!"http".equals(url.getProtocol()) && !"https".equals(url.getProtocol())) return null;
            String normalized = value.trim();
            return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void captureProgress(boolean completed) {
        if (player == null || currentId == null) return;
        long position = Math.max(0L, player.getCurrentPosition());
        long duration = player.getDuration();
        if (duration == C.TIME_UNSET || duration < 0L) duration = 0L;
        boolean isLive = player.isCurrentMediaItemLive();
        progress.put(currentId, new ProgressEntry(
            currentId,
            isLive ? 0L : position,
            isLive ? 0L : duration,
            !isLive && (completed || (duration > 0 && position >= duration * 0.95))
        ));
    }

    private String safeErrorCode(PlaybackException error) {
        return "media_" + error.errorCode;
    }

    private void finishWithResult(String reason, String errorCode, boolean completed) {
        if (resultSent) return;
        resultSent = true;
        captureProgress(completed);
        ProgressEntry current = progress.get(currentId);

        Intent result = new Intent();
        result.putExtra("contentId", currentId);
        result.putExtra("positionMs", current == null ? 0L : current.positionMs);
        result.putExtra("durationMs", current == null ? 0L : current.durationMs);
        result.putExtra("completed", current != null && current.completed);
        result.putExtra("reason", reason);
        if (errorCode != null) result.putExtra("errorCode", errorCode);

        JSONArray entries = new JSONArray();
        for (ProgressEntry entry : progress.values()) entries.put(entry.toJson());
        result.putExtra("progress", entries.toString());
        setResult(Activity.RESULT_OK, result);
        finish();
    }

    @Override
    public void onBackPressed() {
        finishWithResult("back", null, false);
    }

    @Override
    protected void onPause() {
        captureProgress(false);
        if (player != null) player.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        executor.shutdownNow();
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }

    private static class ProgressEntry {
        final String contentId;
        final long positionMs;
        final long durationMs;
        boolean completed;

        ProgressEntry(String contentId, long positionMs, long durationMs, boolean completed) {
            this.contentId = contentId;
            this.positionMs = positionMs;
            this.durationMs = durationMs;
            this.completed = completed;
        }

        JSONObject toJson() {
            JSONObject value = new JSONObject();
            try {
                value.put("contentId", contentId);
                value.put("positionMs", positionMs);
                value.put("durationMs", durationMs);
                value.put("completed", completed);
            } catch (Exception ignored) {}
            return value;
        }
    }
}
