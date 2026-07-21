package com.eduguard.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;

@CapacitorPlugin(
    name = "NativeDownloader",
    permissions = @Permission(alias = "storage", strings = Manifest.permission.WRITE_EXTERNAL_STORAGE)
)
public class NativeDownloaderPlugin extends Plugin {
    @PluginMethod
    public void download(PluginCall call) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        startDownload(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) startDownload(call);
        else call.reject("Storage permission is required to save the report card.");
    }

    private void startDownload(PluginCall call) {
        String url = call.getString("url");
        String fileName = new File(call.getString("fileName", "report-card.pdf")).getName();
        Uri uri = url == null ? null : Uri.parse(url);
        if (uri == null || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || fileName.isBlank()) {
            call.reject("Invalid download request.");
            return;
        }

        DownloadManager.Request request = new DownloadManager.Request(uri)
            .setTitle(fileName)
            .setMimeType(call.getString("mimeType", "application/octet-stream"))
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
        String token = call.getString("token");
        if (token != null && !token.isBlank()) request.addRequestHeader("Authorization", "Bearer " + token);

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Android download service is unavailable.");
            return;
        }
        long id = manager.enqueue(request);
        JSObject result = new JSObject();
        result.put("id", id);
        call.resolve(result);
    }
}
