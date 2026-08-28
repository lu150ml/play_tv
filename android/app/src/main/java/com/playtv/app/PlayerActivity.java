package com.playtv.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
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
    private static final long CONTROLS_TIMEOUT_MS = 5_000L;
    private static final int SOURCE_TIMEOUT_MS = 5_000;
    private static WeakReference<PlayerActivity> activeActivity = new WeakReference<>(null);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, ProgressEntry> progress = new LinkedHashMap<>();
    private final List<MediaDescriptor> descriptors = new ArrayList<>();
    private ExoPlayer player;
    private MediaSession mediaSession;
    private PlayerView playerView;
    private View controls;
    private ProgressBar buffering;
    private TextView titleView;
    private TextView positionView;
    private TextView durationView;
    private SeekBar seekBar;
    private ImageButton playPauseButton;
    private ImageButton pipButton;
    private ImageButton rewindButton;
    private ImageButton forwardButton;
    private Button episodesButton;
    private Button tracksButton;
    private Button nextButton;
    private View seekRow;
    private String currentId;
    private int retryCount;
    private boolean resultSent;
    private boolean controlsVisible = true;
    private boolean userSeeking;
    private boolean enteringPip;
    private boolean pipSupported;
    private boolean closingPlayer;
    private boolean candidateSwitchInProgress;

    private final Runnable progressSaver = new Runnable() {
        @Override public void run() {
            captureProgress(false, true);
            handler.postDelayed(this, SAVE_INTERVAL_MS);
        }
    };
    private final Runnable timelineUpdater = new Runnable() {
        @Override public void run() {
            updateTimeline();
            handler.postDelayed(this, 500L);
        }
    };
    private final Runnable hideControls = () -> setControlsVisible(false);

    public static boolean hasActivePlayer() {
        PlayerActivity activity = activeActivity.get();
        return activity != null && !activity.isFinishing() && !activity.isDestroyed();
    }

    public static boolean requestClose(String reason) {
        PlayerActivity activity = activeActivity.get();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) return false;
        activity.runOnUiThread(() -> activity.finishWithResult(
            reason == null || reason.isEmpty() ? "back" : reason, null, false
        ));
        return true;
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeActivity = new WeakReference<>(this);
        setImmersiveMode();
        setContentView(R.layout.activity_player);
        bindViews();
        pipSupported = detectPipSupport();
        pipButton.setVisibility(pipSupported ? View.VISIBLE : View.INVISIBLE);
        currentId = getIntent().getStringExtra("contentId");
        readDescriptors();
        wireControls();
        emitState("fullscreen", null);

        String subtitleBase = sanitizeHttpBase(getIntent().getStringExtra("subtitleApiBaseUrl"));
        String subtitleQuery = getIntent().getStringExtra("subtitleQuery");
        if (subtitleBase != null && subtitleQuery != null && !"{}".equals(subtitleQuery)) {
            buffering.setVisibility(View.VISIBLE);
            executor.execute(() -> {
                List<MediaItem.SubtitleConfiguration> subtitles = fetchSubtitles(subtitleBase, subtitleQuery);
                preflightCurrentDescriptor();
                runOnUiThread(() -> initializePlayer(subtitles));
            });
        } else {
            buffering.setVisibility(View.VISIBLE);
            executor.execute(() -> {
                preflightCurrentDescriptor();
                runOnUiThread(() -> initializePlayer(new ArrayList<>()));
            });
        }
    }

    private void bindViews() {
        playerView = findViewById(R.id.player_view);
        controls = findViewById(R.id.player_controls);
        buffering = findViewById(R.id.player_buffering);
        titleView = findViewById(R.id.player_title);
        positionView = findViewById(R.id.player_position);
        durationView = findViewById(R.id.player_duration);
        seekBar = findViewById(R.id.player_seek);
        seekRow = findViewById(R.id.player_seek_row);
        playPauseButton = findViewById(R.id.player_play_pause);
        pipButton = findViewById(R.id.player_pip);
        rewindButton = findViewById(R.id.player_rewind);
        forwardButton = findViewById(R.id.player_forward);
        episodesButton = findViewById(R.id.player_episodes);
        tracksButton = findViewById(R.id.player_tracks);
        nextButton = findViewById(R.id.player_next);
    }

    private void wireControls() {
        findViewById(R.id.player_back).setOnClickListener(
            view -> finishWithResult("back", null, false)
        );
        pipButton.setOnClickListener(view -> enterPip());
        playPauseButton.setOnClickListener(view -> togglePlayback());
        rewindButton.setOnClickListener(view -> seekBy(-10_000L));
        forwardButton.setOnClickListener(view -> seekBy(10_000L));
        nextButton.setOnClickListener(view -> {
            if (player != null && player.hasNextMediaItem()) {
                captureProgress(false, true);
                player.seekToNextMediaItem();
                player.play();
            }
        });
        episodesButton.setOnClickListener(view -> showEpisodePicker());
        tracksButton.setOnClickListener(view -> showTrackTypePicker());
        findViewById(R.id.player_root).setOnClickListener(view -> revealControls());
        playerView.setOnClickListener(view -> revealControls());
        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (!fromUser || player == null) return;
                long duration = player.getDuration();
                if (duration > 0 && duration != C.TIME_UNSET) {
                    positionView.setText(formatTime(duration * value / 1000L));
                }
            }
            @Override public void onStartTrackingTouch(SeekBar bar) {
                userSeeking = true;
                revealControls();
            }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                userSeeking = false;
                if (player != null && !isLive()) {
                    long duration = player.getDuration();
                    if (duration > 0 && duration != C.TIME_UNSET) {
                        player.seekTo(duration * bar.getProgress() / 1000L);
                    }
                }
                scheduleControlsTimeout();
            }
        });
    }

    private void initializePlayer(List<MediaItem.SubtitleConfiguration> subtitles) {
        if (isFinishing() || isDestroyed()) return;
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).setUsage(C.USAGE_MEDIA).build();
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(audioAttributes, true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.setHandleAudioBecomingNoisy(true);
        player.setVolume(1f);
        playerView.setPlayer(player);
        mediaSession = new MediaSession.Builder(this, player).build();

        List<MediaItem> playlist = buildPlaylist(subtitles);
        if (playlist.isEmpty()) {
            finishWithResult("error", "missing_media", false);
            return;
        }
        int initialIndex = findDescriptorIndex(currentId);
        if (initialIndex < 0) initialIndex = 0;
        MediaDescriptor initial = descriptors.get(initialIndex);
        currentId = initial.id;
        player.setMediaItems(playlist, initialIndex, Math.max(0L, initial.startPositionMs));
        player.addListener(new Player.Listener() {
            @Override public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                String previousId = currentId;
                if (mediaItem != null) currentId = mediaItem.mediaId;
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && previousId != null) {
                    ProgressEntry previous = progress.get(previousId);
                    if (previous != null) previous.completed = true;
                }
                retryCount = 0;
                updateMediaUi();
                emitState("playing", null);
            }
            @Override public void onPlaybackStateChanged(int state) {
                buffering.setVisibility(
                    state == Player.STATE_BUFFERING && player.getPlayWhenReady() && !isLive()
                        ? View.VISIBLE : View.GONE
                );
                if (state == Player.STATE_READY) retryCount = 0;
                if (state == Player.STATE_ENDED) {
                    captureProgress(true, true);
                    handler.postDelayed(() -> finishWithResult("ended", null, true), 500L);
                }
                updatePlaybackUi();
            }
            @Override public void onIsPlayingChanged(boolean isPlaying) {
                updatePlaybackUi();
                emitState(isPlaying ? "playing" : "paused", null);
            }
            @Override public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                updatePlaybackUi();
            }
            @Override public void onVideoSizeChanged(@NonNull VideoSize videoSize) {
                updatePipParams();
            }
            @Override public void onPlayerError(@NonNull PlaybackException error) {
                updateKeepScreenOn(false);
                if (beginNextCandidate(error)) return;
                handlePlaybackFailure(error);
            }
        });
        player.prepare();
        player.play();
        updateMediaUi();
        updatePlaybackUi();
        buffering.setVisibility(View.GONE);
        handler.postDelayed(progressSaver, SAVE_INTERVAL_MS);
        handler.post(timelineUpdater);
        scheduleControlsTimeout();
    }

    private void handlePlaybackFailure(@NonNull PlaybackException error) {
        if (player == null || closingPlayer) return;
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
                emitState("error", safeErrorCode(error));
                finishWithResult("error", safeErrorCode(error), false);
    }

    private List<MediaItem> buildPlaylist(List<MediaItem.SubtitleConfiguration> subtitles) {
        List<MediaItem> result = new ArrayList<>();
        for (MediaDescriptor descriptor : descriptors) {
            result.add(buildMediaItem(descriptor, descriptor.id.equals(currentId) ? subtitles : new ArrayList<>()));
        }
        return result;
    }

    private void readDescriptors() {
        Intent intent = getIntent();
        try {
            JSONArray playlist = new JSONArray(safeValue(intent.getStringExtra("playlist"), "[]"));
            for (int index = 0; index < playlist.length(); index += 1) {
                MediaDescriptor descriptor = MediaDescriptor.fromJson(playlist.getJSONObject(index));
                if (descriptor != null) descriptors.add(descriptor);
            }
        } catch (Exception ignored) {}
        if (!descriptors.isEmpty()) return;
        MediaDescriptor current = new MediaDescriptor(
            safeValue(intent.getStringExtra("contentId"), "media"),
            safeValue(intent.getStringExtra("title"), "Play TV"),
            safeValue(intent.getStringExtra("streamUrl"), ""),
            safeValue(intent.getStringExtra("kind"), "movie"),
            intent.getLongExtra("startPositionMs", 0L),
            intent.getIntExtra("season", 0), intent.getIntExtra("episode", 0),
            readCandidates(intent.getStringExtra("streamCandidates"))
        );
        if (!current.streamUrl.isEmpty()) descriptors.add(current);
        try {
            JSONArray next = new JSONArray(safeValue(intent.getStringExtra("nextEpisodes"), "[]"));
            for (int index = 0; index < next.length(); index += 1) {
                MediaDescriptor descriptor = MediaDescriptor.fromJson(next.getJSONObject(index));
                if (descriptor != null) descriptors.add(descriptor);
            }
        } catch (Exception ignored) {}
    }

    private List<String> readCandidates(String json) {
        List<String> result = new ArrayList<>();
        try {
            JSONArray values = new JSONArray(safeValue(json, "[]"));
            for (int index = 0; index < values.length(); index += 1) {
                String value = values.optString(index).trim();
                if (!value.isEmpty() && !result.contains(value)) result.add(value);
            }
        } catch (Exception ignored) {}
        return result;
    }

    private MediaItem buildMediaItem(
        MediaDescriptor descriptor,
        List<MediaItem.SubtitleConfiguration> subtitles
    ) {
        MediaItem.Builder builder = new MediaItem.Builder()
            .setMediaId(descriptor.id).setUri(descriptor.currentUrl())
            .setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder()
                .setTitle(descriptor.displayTitle()).build());
        if (!subtitles.isEmpty()) builder.setSubtitleConfigurations(subtitles);
        String mime = descriptor.mimeHint;
        if (mime == null && descriptor.currentUrl().toLowerCase().contains(".m3u8")) {
            mime = MimeTypes.APPLICATION_M3U8;
        }
        if (mime != null) builder.setMimeType(mime);
        return builder.build();
    }

    private void preflightCurrentDescriptor() {
        MediaDescriptor descriptor = currentDescriptor();
        if (descriptor == null) return;
        while (descriptor.candidateIndex < descriptor.candidates.size()) {
            SourceProbe probe = probeSource(descriptor.currentUrl());
            if (probe.valid) {
                descriptor.mimeHint = probe.mimeType;
                return;
            }
            descriptor.candidateIndex += 1;
        }
        descriptor.candidateIndex = 0;
    }

    private SourceProbe probeSource(String urlValue) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlValue).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(SOURCE_TIMEOUT_MS);
            connection.setReadTimeout(SOURCE_TIMEOUT_MS);
            connection.setRequestProperty("Range", "bytes=0-4095");
            connection.setRequestProperty("Accept", "video/*,audio/*,application/vnd.apple.mpegurl,*/*");
            connection.setRequestProperty("User-Agent", "PlayTV-Android/1.4");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return SourceProbe.invalid();
            String contentType = safeValue(connection.getContentType(), "").toLowerCase();
            if (contentType.contains("text/html") || contentType.contains("application/json")) {
                return SourceProbe.invalid();
            }
            byte[] prefix = new byte[512];
            int read;
            try (InputStream input = connection.getInputStream()) { read = input.read(prefix); }
            if (read <= 0) return SourceProbe.invalid();
            String text = new String(prefix, 0, Math.min(read, 16), StandardCharsets.US_ASCII).trim();
            if (text.startsWith("<") || text.startsWith("{")) return SourceProbe.invalid();
            if (text.startsWith("#EXTM3U")) return SourceProbe.valid(MimeTypes.APPLICATION_M3U8);
            if ((prefix[0] & 0xff) == 0x47 || contentType.contains("mp2t")) return SourceProbe.valid(MimeTypes.VIDEO_MP2T);
            if (read > 8 && prefix[4] == 'f' && prefix[5] == 't' && prefix[6] == 'y' && prefix[7] == 'p') return SourceProbe.valid(MimeTypes.VIDEO_MP4);
            if ((prefix[0] & 0xff) == 0x1a && (prefix[1] & 0xff) == 0x45) return SourceProbe.valid(MimeTypes.VIDEO_WEBM);
            if (contentType.contains("mpegurl")) return SourceProbe.valid(MimeTypes.APPLICATION_M3U8);
            if (contentType.startsWith("video/") || contentType.startsWith("audio/") || contentType.contains("octet-stream")) return SourceProbe.valid(null);
            return SourceProbe.invalid();
        } catch (Exception ignored) {
            return SourceProbe.invalid();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean beginNextCandidate(@NonNull PlaybackException originalError) {
        MediaDescriptor descriptor = currentDescriptor();
        if (descriptor == null || player == null || candidateSwitchInProgress || !descriptor.advanceCandidate()) return false;
        long position = Math.max(0L, player.getCurrentPosition());
        int mediaIndex = Math.max(0, player.getCurrentMediaItemIndex());
        candidateSwitchInProgress = true;
        executor.execute(() -> {
            SourceProbe selected = SourceProbe.invalid();
            while (descriptor.candidateIndex < descriptor.candidates.size()) {
                selected = probeSource(descriptor.currentUrl());
                if (selected.valid) break;
                if (!descriptor.advanceCandidate()) break;
            }
            SourceProbe finalProbe = selected;
            handler.post(() -> {
                candidateSwitchInProgress = false;
                if (player == null || closingPlayer || descriptor != currentDescriptor()) return;
                if (!finalProbe.valid) {
                    handlePlaybackFailure(originalError);
                    return;
                }
                descriptor.mimeHint = finalProbe.mimeType;
                player.replaceMediaItem(mediaIndex, buildMediaItem(descriptor, new ArrayList<>()));
                player.seekTo(mediaIndex, descriptor.isLive() ? 0L : position);
                player.prepare();
                player.play();
                retryCount = 0;
            });
        });
        return true;
    }

    private void updateMediaUi() {
        MediaDescriptor descriptor = currentDescriptor();
        if (descriptor == null) return;
        titleView.setText(descriptor.displayTitle());
        boolean live = descriptor.isLive();
        seekRow.setVisibility(live ? View.GONE : View.VISIBLE);
        rewindButton.setVisibility(live ? View.GONE : View.VISIBLE);
        forwardButton.setVisibility(live ? View.GONE : View.VISIBLE);
        episodesButton.setVisibility(!live && descriptors.size() > 1 ? View.VISIBLE : View.GONE);
        nextButton.setVisibility(!live && player != null && player.hasNextMediaItem() ? View.VISIBLE : View.GONE);
        tracksButton.setVisibility(live ? View.GONE : View.VISIBLE);
        updateTimeline();
    }

    private void updatePlaybackUi() {
        if (player == null) return;
        boolean isPlaying = player.isPlaying();
        playPauseButton.setImageResource(isPlaying
            ? R.drawable.ic_player_pause : R.drawable.ic_player_play);
        playPauseButton.setContentDescription(isPlaying ? "Pausar" : "Reproduzir");
        boolean keepAwake = shouldKeepScreenAwake(player.getPlayWhenReady(), player.getPlaybackState());
        updateKeepScreenOn(keepAwake);
        updatePipParams();
        if (isPlaying) scheduleControlsTimeout(); else revealControls();
    }

    private void updateTimeline() {
        if (player == null || userSeeking || isLive()) return;
        long duration = player.getDuration();
        long position = Math.max(0L, player.getCurrentPosition());
        if (duration == C.TIME_UNSET || duration <= 0L) {
            durationView.setText("--:--");
            seekBar.setProgress(0);
        } else {
            durationView.setText(formatTime(duration));
            seekBar.setProgress((int) Math.min(1000L, position * 1000L / duration));
        }
        positionView.setText(formatTime(position));
    }

    private void togglePlayback() {
        if (player == null) return;
        if (player.isPlaying()) player.pause(); else player.play();
        revealControls();
    }

    private void seekBy(long deltaMs) {
        if (player == null || isLive()) return;
        long duration = player.getDuration();
        long target = Math.max(0L, player.getCurrentPosition() + deltaMs);
        if (duration > 0 && duration != C.TIME_UNSET) target = Math.min(duration, target);
        player.seekTo(target);
        updateTimeline();
        revealControls();
    }

    private void showEpisodePicker() {
        if (descriptors.size() <= 1 || player == null) return;
        String[] labels = new String[descriptors.size()];
        int checked = Math.max(0, findDescriptorIndex(currentId));
        for (int index = 0; index < descriptors.size(); index += 1) labels[index] = descriptors.get(index).displayTitle();
        new AlertDialog.Builder(this).setTitle("Episódios")
            .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                captureProgress(false, true);
                MediaDescriptor selected = descriptors.get(which);
                player.seekTo(which, Math.max(0L, selected.startPositionMs));
                player.play();
                dialog.dismiss();
            }).setNegativeButton("Cancelar", null).show();
    }

    private void showTrackTypePicker() {
        if (player == null) return;
        String[] choices = { getString(R.string.player_audio), getString(R.string.player_subtitles) };
        new AlertDialog.Builder(this).setTitle("Áudio e legendas")
            .setItems(choices, (dialog, which) -> showTrackPicker(
                which == 0 ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT, choices[which]
            )).setNegativeButton("Cancelar", null).show();
    }

    private void showTrackPicker(int trackType, String title) {
        if (player == null) return;
        try {
            new TrackSelectionDialogBuilder(this, title, player, trackType)
                .setAllowAdaptiveSelections(true).build().show();
        } catch (Exception ignored) {
            new AlertDialog.Builder(this).setMessage(R.string.player_no_tracks)
                .setPositiveButton("OK", null).show();
        }
    }

    private void revealControls() {
        if (isInPip()) return;
        setControlsVisible(true);
        scheduleControlsTimeout();
    }

    private void setControlsVisible(boolean visible) {
        controlsVisible = visible;
        controls.animate().alpha(visible ? 1f : 0f).setDuration(180L)
            .withStartAction(() -> { if (visible) controls.setVisibility(View.VISIBLE); })
            .withEndAction(() -> { if (!visible) controls.setVisibility(View.GONE); }).start();
    }

    private void scheduleControlsTimeout() {
        handler.removeCallbacks(hideControls);
        if (player != null && player.isPlaying() && !isInPip()) {
            handler.postDelayed(hideControls, CONTROLS_TIMEOUT_MS);
        }
    }

    private boolean detectPipSupport() {
        boolean hasFeature = getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        UiModeManager manager = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        boolean television = manager != null && manager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        return supportsPipForDevice(Build.VERSION.SDK_INT, hasFeature, television);
    }

    static boolean shouldKeepScreenAwake(boolean playWhenReady, int playbackState) {
        return playWhenReady && (playbackState == Player.STATE_READY || playbackState == Player.STATE_BUFFERING);
    }

    static boolean supportsPipForDevice(int sdk, boolean hasFeature, boolean television) {
        return sdk >= Build.VERSION_CODES.O && hasFeature && (!television || sdk >= 34);
    }

    private boolean shouldEnterPip() {
        return shouldEnterPipForState(
            closingPlayer,
            pipSupported,
            player != null,
            player != null && player.isPlaying()
        );
    }

    static boolean shouldEnterPipForState(
        boolean closing,
        boolean supported,
        boolean playerExists,
        boolean playing
    ) {
        return !closing && supported && playerExists && playing;
    }

    private void enterPip() {
        if (!shouldEnterPip() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        enteringPip = true;
        updatePipParams();
        try {
            enterPictureInPictureMode(buildPipParams(false));
        } catch (Exception ignored) {
            enteringPip = false;
        }
    }

    private void updatePipParams() {
        if (!pipSupported || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            setPictureInPictureParams(buildPipParams(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && shouldEnterPip()));
        } catch (Exception ignored) {}
    }

    private PictureInPictureParams buildPipParams(boolean autoEnter) {
        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
        int width = 16;
        int height = 9;
        if (player != null) {
            VideoSize size = player.getVideoSize();
            if (size.width > 0 && size.height > 0) { width = size.width; height = size.height; }
        }
        try {
            builder.setAspectRatio(new Rational(width, height));
            Rect source = new Rect();
            if (playerView.getGlobalVisibleRect(source)) builder.setSourceRectHint(source);
        } catch (Exception ignored) {}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(autoEnter);
            builder.setSeamlessResizeEnabled(true);
        }
        return builder.build();
    }

    private void handleBackAction() {
        if (shouldEnterPip()) enterPip(); else finishWithResult("back", null, false);
    }

    @Override public void onBackPressed() { handleBackAction(); }

    @Override public void onUserLeaveHint() {
        if (shouldEnterPip()) {
            enteringPip = true;
            updatePipParams();
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterPip();
        }
        super.onUserLeaveHint();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, @NonNull Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPip, newConfig);
        enteringPip = false;
        controls.setVisibility(inPip ? View.GONE : View.VISIBLE);
        controls.setAlpha(1f);
        controlsVisible = !inPip;
        emitState(inPip ? "pip" : "fullscreen", null);
        if (!inPip) {
            setImmersiveMode();
            revealControls();
        }
    }

    @Override protected void onPause() {
        captureProgress(false, true);
        if (player != null && !isInPip() && !enteringPip) player.pause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        setImmersiveMode();
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        executor.shutdownNow();
        if (!resultSent) {
            prepareResult("back", null, false);
            emitState("closed", null);
        }
        releasePlaybackResources();
        if (activeActivity.get() == this) activeActivity = new WeakReference<>(null);
        super.onDestroy();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int code = event.getKeyCode();
            if (!controlsVisible && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN
                || code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT)) {
                revealControls();
                playPauseButton.requestFocus();
                return true;
            }
            if (code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) { togglePlayback(); return true; }
            if (code == KeyEvent.KEYCODE_MEDIA_REWIND) { seekBy(-10_000L); return true; }
            if (code == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seekBy(10_000L); return true; }
        }
        return super.dispatchKeyEvent(event);
    }

    private void captureProgress(boolean completed, boolean notify) {
        if (player == null || currentId == null) return;
        long position = Math.max(0L, player.getCurrentPosition());
        long duration = player.getDuration();
        if (duration == C.TIME_UNSET || duration < 0L) duration = 0L;
        boolean live = isLive();
        ProgressEntry entry = new ProgressEntry(currentId, live ? 0L : position, live ? 0L : duration,
            !live && (completed || (duration > 0L && position >= duration * 0.95)));
        progress.put(currentId, entry);
        if (notify) emitState("progress", null);
    }

    private void finishWithResult(String reason, String errorCode, boolean completed) {
        if (resultSent) return;
        closingPlayer = true;
        handler.removeCallbacksAndMessages(null);
        prepareResult(reason, errorCode, completed);
        activeActivity = new WeakReference<>(null);
        emitState("error".equals(reason) ? "error" : ("ended".equals(reason) ? "ended" : "closed"), errorCode);
        releasePlaybackResources();
        finish();
    }

    private void releasePlaybackResources() {
        updateKeepScreenOn(false);
        if (player != null) {
            player.pause();
            player.stop();
            player.clearMediaItems();
            playerView.setPlayer(null);
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
    }

    private void prepareResult(String reason, String errorCode, boolean completed) {
        if (resultSent) return;
        resultSent = true;
        captureProgress(completed, false);
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
    }

    private void emitState(String state, @Nullable String errorCode) {
        ProgressEntry entry = progress.get(currentId);
        NativePlayerPlugin.emitState(state, currentId, entry == null ? 0L : entry.positionMs,
            entry == null ? 0L : entry.durationMs, errorCode);
    }

    private void updateKeepScreenOn(boolean keepOn) {
        if (keepOn) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void setImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private boolean isInPip() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
    }

    private boolean isLive() {
        MediaDescriptor descriptor = currentDescriptor();
        return descriptor != null && descriptor.isLive();
    }

    @Nullable private MediaDescriptor currentDescriptor() {
        int index = findDescriptorIndex(currentId);
        return index >= 0 ? descriptors.get(index) : null;
    }

    private int findDescriptorIndex(String id) {
        if (id == null) return -1;
        for (int index = 0; index < descriptors.size(); index += 1) {
            if (id.equals(descriptors.get(index).id)) return index;
        }
        return -1;
    }

    private String safeErrorCode(PlaybackException error) { return "media_" + error.errorCode; }
    private String safeValue(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private String formatTime(long milliseconds) {
        long seconds = Math.max(0L, milliseconds / 1000L);
        long hours = seconds / 3600L;
        long minutes = (seconds % 3600L) / 60L;
        long remainder = seconds % 60L;
        return hours > 0L ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", hours, minutes, remainder)
            : String.format(java.util.Locale.ROOT, "%02d:%02d", minutes, remainder);
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
                Uri uri = Uri.parse(baseUrl + "/api/subtitles/file?fileId="
                    + URLEncoder.encode(fileId, "UTF-8"));
                result.add(new MediaItem.SubtitleConfiguration.Builder(uri).setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(entry.optString("language", "pt"))
                    .setLabel(entry.optString("release", "Legenda")).build());
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
        } finally { connection.disconnect(); }
    }

    private String sanitizeHttpBase(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        try {
            URL url = new URL(value.trim());
            if (!"http".equals(url.getProtocol()) && !"https".equals(url.getProtocol())) return null;
            String normalized = value.trim();
            return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
        } catch (Exception ignored) { return null; }
    }

    private static class MediaDescriptor {
        final String id;
        final String title;
        final String streamUrl;
        final String kind;
        final long startPositionMs;
        final int season;
        final int episode;
        final List<String> candidates;
        int candidateIndex;
        String mimeHint;
        MediaDescriptor(String id, String title, String streamUrl, String kind,
                        long startPositionMs, int season, int episode, List<String> streamCandidates) {
            this.id = id; this.title = title; this.streamUrl = streamUrl; this.kind = kind;
            this.startPositionMs = startPositionMs; this.season = season; this.episode = episode;
            this.candidates = new ArrayList<>();
            if (streamCandidates != null) {
                for (String candidate : streamCandidates) {
                    if (candidate != null && !candidate.trim().isEmpty() && !this.candidates.contains(candidate)) {
                        this.candidates.add(candidate);
                    }
                }
            }
            if (!streamUrl.isEmpty() && !this.candidates.contains(streamUrl)) this.candidates.add(streamUrl);
            this.candidateIndex = 0;
        }
        @Nullable static MediaDescriptor fromJson(JSONObject value) {
            String id = value.optString("contentId");
            String streamUrl = value.optString("streamUrl");
            if (id.isEmpty() || streamUrl.isEmpty()) return null;
            List<String> candidates = new ArrayList<>();
            JSONArray values = value.optJSONArray("streamCandidates");
            if (values != null) {
                for (int index = 0; index < values.length(); index += 1) {
                    String candidate = values.optString(index).trim();
                    if (!candidate.isEmpty() && !candidates.contains(candidate)) candidates.add(candidate);
                }
            }
            return new MediaDescriptor(id, value.optString("title", "Play TV"), streamUrl,
                value.optString("kind", "episode"), Math.max(0L, value.optLong("startPositionMs", 0L)),
                value.optInt("season", 0), value.optInt("episode", 0), candidates);
        }
        String currentUrl() { return candidates.isEmpty() ? streamUrl : candidates.get(Math.min(candidateIndex, candidates.size() - 1)); }
        boolean advanceCandidate() {
            if (candidateIndex + 1 >= candidates.size()) return false;
            candidateIndex += 1;
            mimeHint = null;
            return true;
        }
        boolean isLive() { return "live".equals(kind); }
        String displayTitle() {
            return season > 0 && episode > 0 ? "S" + season + ":E" + episode + " \"" + title + "\"" : title;
        }
    }

    private static class SourceProbe {
        final boolean valid;
        final String mimeType;
        SourceProbe(boolean valid, String mimeType) { this.valid = valid; this.mimeType = mimeType; }
        static SourceProbe valid(String mimeType) { return new SourceProbe(true, mimeType); }
        static SourceProbe invalid() { return new SourceProbe(false, null); }
    }

    private static class ProgressEntry {
        final String contentId;
        final long positionMs;
        final long durationMs;
        boolean completed;
        ProgressEntry(String contentId, long positionMs, long durationMs, boolean completed) {
            this.contentId = contentId; this.positionMs = positionMs;
            this.durationMs = durationMs; this.completed = completed;
        }
        JSONObject toJson() {
            JSONObject value = new JSONObject();
            try {
                value.put("contentId", contentId); value.put("positionMs", positionMs);
                value.put("durationMs", durationMs); value.put("completed", completed);
            } catch (Exception ignored) {}
            return value;
        }
    }
}
