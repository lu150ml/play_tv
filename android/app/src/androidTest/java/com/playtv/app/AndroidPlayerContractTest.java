package com.playtv.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.ActivityInfo;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidPlayerContractTest {
    @Test
    public void nativePlayerIsInternalAndLandscape() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        @SuppressWarnings("deprecation")
        ActivityInfo info = context.getPackageManager().getActivityInfo(
            new android.content.ComponentName(context, PlayerActivity.class),
            0
        );

        assertFalse(info.exported);
        assertEquals(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE, info.screenOrientation);
        assertTrue((info.flags & ActivityInfo.FLAG_SUPPORTS_PICTURE_IN_PICTURE) != 0);
        assertTrue((info.configChanges & ActivityInfo.CONFIG_SCREEN_SIZE) != 0);
        assertTrue((info.configChanges & ActivityInfo.CONFIG_SMALLEST_SCREEN_SIZE) != 0);
    }
}
