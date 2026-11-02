package io.ionic.starter;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "ExportFile")
public class ExportFilePlugin extends Plugin {
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType");
        String data = call.getString("data");
        if (filename == null || filename.isEmpty() || mimeType == null || data == null) {
            call.reject("Informasi file ekspor tidak lengkap.");
            return;
        }

        try {
            byte[] contents = Base64.decode(data, Base64.DEFAULT);
            Uri uri;
            String location;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                uri = getContext().getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    values
                );
                if (uri == null) {
                    throw new IllegalStateException("File ekspor tidak dapat dibuat di Downloads.");
                }

                try {
                    try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                        if (output == null) {
                            throw new IllegalStateException("File ekspor tidak dapat ditulis.");
                        }
                        output.write(contents);
                    }

                    ContentValues published = new ContentValues();
                    published.put(MediaStore.Downloads.IS_PENDING, 0);
                    if (getContext().getContentResolver().update(uri, published, null, null) == 0) {
                        throw new IllegalStateException("File ekspor tidak dapat dipublikasikan di Downloads.");
                    }
                } catch (Exception error) {
                    getContext().getContentResolver().delete(uri, null, null);
                    throw error;
                }
                location = "Download/" + filename;
            } else {
                File directory = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null || (!directory.exists() && !directory.mkdirs())) {
                    throw new IllegalStateException("Folder Downloads tidak dapat dibuat.");
                }
                File file = new File(directory, filename);
                try (FileOutputStream output = new FileOutputStream(file)) {
                    output.write(contents);
                }
                uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
                );
                location = file.getAbsolutePath();
            }

            JSObject result = new JSObject();
            result.put("filename", filename);
            result.put("uri", uri.toString());
            result.put("location", location);
            result.put("mimeType", mimeType);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("File ekspor gagal disimpan.", error);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        launchFileIntent(call, true);
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        launchFileIntent(call, false);
    }

    private void launchFileIntent(PluginCall call, boolean share) {
        String uriValue = call.getString("uri");
        String mimeType = call.getString("mimeType");
        if (uriValue == null || mimeType == null) {
            call.reject("Informasi file ekspor tidak lengkap.");
            return;
        }

        try {
            Uri uri = Uri.parse(uriValue);
            Intent fileIntent;
            String chooserTitle;
            if (share) {
                fileIntent = new Intent(Intent.ACTION_SEND);
                fileIntent.setType(mimeType);
                fileIntent.putExtra(Intent.EXTRA_STREAM, uri);
                chooserTitle = "Kirim file";
            } else {
                fileIntent = new Intent(Intent.ACTION_VIEW);
                fileIntent.setDataAndType(uri, mimeType);
                chooserTitle = "Buka dengan";
            }
            fileIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            fileIntent.setClipData(android.content.ClipData.newRawUri("file", uri));
            Intent chooser = Intent.createChooser(fileIntent, chooserTitle);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception error) {
            call.reject(share ? "Menu berbagi file tidak dapat dibuka." : "Aplikasi untuk membuka file tidak ditemukan.", error);
        }
    }
}
