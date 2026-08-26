package com.playtv.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.media3.common.Player;

import org.junit.Test;

public class PlayerPolicyTest {
    @Test
    public void keepsScreenAwakeOnlyDuringIntendedPlayback() {
        assertTrue(PlayerActivity.shouldKeepScreenAwake(true, Player.STATE_READY));
        assertTrue(PlayerActivity.shouldKeepScreenAwake(true, Player.STATE_BUFFERING));
        assertFalse(PlayerActivity.shouldKeepScreenAwake(false, Player.STATE_READY));
        assertFalse(PlayerActivity.shouldKeepScreenAwake(true, Player.STATE_ENDED));
        assertFalse(PlayerActivity.shouldKeepScreenAwake(true, Player.STATE_IDLE));
    }

    @Test
    public void pictureInPictureHonorsAndroidAndTelevisionFallbacks() {
        assertFalse(PlayerActivity.supportsPipForDevice(24, true, false));
        assertTrue(PlayerActivity.supportsPipForDevice(26, true, false));
        assertFalse(PlayerActivity.supportsPipForDevice(33, true, true));
        assertTrue(PlayerActivity.supportsPipForDevice(34, true, true));
        assertFalse(PlayerActivity.supportsPipForDevice(36, false, false));
    }
}
