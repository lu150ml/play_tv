package com.playtv.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecureCredentialsPlugin.class);
        registerPlugin(NativePlayerPlugin.class);
        registerPlugin(AndroidUpdaterPlugin.class);
        registerPlugin(MediaAssetsPlugin.class);
        registerPlugin(DownloadsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
