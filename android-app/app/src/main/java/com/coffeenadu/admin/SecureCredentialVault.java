package com.coffeenadu.admin;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/**
 * Hardware-backed Android Keystore credential vault for CoffeeNadu Admin.
 *
 * Security guarantees:
 * - Uses AES-256-GCM with a non-exportable key stored in AndroidKeyStore.
 * - Generates a fresh cryptographic IV on every save (randomized encryption).
 * - Never writes plaintext credentials, never uses ordinary SharedPreferences,
 *   and never depends on Google Password Manager or Android Autofill.
 * - Stores encrypted binary payload only in an app-private internal file.
 */
public final class SecureCredentialVault {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "com.coffeenadu.admin.vault.aes256gcm.v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final String VAULT_FILE_NAME = "cn_admin_keystore_vault.bin";

    private final File vaultFile;

    public SecureCredentialVault(Context context) {
        this.vaultFile = new File(context.getApplicationContext().getFilesDir(), VAULT_FILE_NAME);
    }

    private synchronized SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);

        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
        );
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build();

        keyGenerator.init(spec);
        return keyGenerator.generateKey();
    }

    public synchronized boolean saveCredentials(String email, String password) {
        if (email == null || email.trim().isEmpty() || password == null || password.isEmpty()) {
            return false;
        }
        try {
            JSONObject payload = new JSONObject();
            payload.put("email", email.trim().toLowerCase());
            payload.put("password", password);
            payload.put("savedAt", System.currentTimeMillis());

            byte[] plaintext = payload.toString().getBytes(StandardCharsets.UTF_8);
            SecretKey key = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(plaintext);

            if (iv == null || iv.length == 0 || iv.length > 64) {
                return false;
            }

            File tmpFile = new File(vaultFile.getParentFile(), VAULT_FILE_NAME + ".tmp");
            try (FileOutputStream fos = new FileOutputStream(tmpFile, false)) {
                fos.write(iv.length & 0xFF);
                fos.write(iv);
                fos.write(ciphertext);
                fos.getFD().sync();
            }
            if (vaultFile.exists() && !vaultFile.delete()) {
                // Best-effort replace
            }
            return tmpFile.renameTo(vaultFile);
        } catch (Exception e) {
            return false;
        }
    }

    public synchronized String loadCredentialsJson() {
        if (!vaultFile.exists() || vaultFile.length() < 16) {
            return "";
        }
        try {
            byte[] raw = readAllBytes(vaultFile);
            if (raw.length < 16) {
                clearCredentials();
                return "";
            }
            int ivLen = raw[0] & 0xFF;
            if (ivLen < 12 || ivLen > 64 || raw.length <= 1 + ivLen) {
                clearCredentials();
                return "";
            }
            byte[] iv = new byte[ivLen];
            System.arraycopy(raw, 1, iv, 0, ivLen);

            int cipherLen = raw.length - 1 - ivLen;
            byte[] ciphertext = new byte[cipherLen];
            System.arraycopy(raw, 1 + ivLen, ciphertext, 0, cipherLen);

            SecretKey key = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);

            JSONObject parsed = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
            String email = parsed.optString("email", "").trim();
            String password = parsed.optString("password", "");
            if (email.isEmpty() || password.isEmpty()) {
                clearCredentials();
                return "";
            }

            JSONObject safeOut = new JSONObject();
            safeOut.put("email", email);
            safeOut.put("password", password);
            return safeOut.toString();
        } catch (Exception e) {
            // Keystore invalidated or corrupted payload: wipe cleanly
            clearCredentials();
            return "";
        }
    }

    public synchronized boolean clearCredentials() {
        if (!vaultFile.exists()) {
            return true;
        }
        try {
            // Overwrite vault file bytes before deletion
            long len = Math.min(vaultFile.length(), 4096);
            if (len > 0) {
                try (FileOutputStream fos = new FileOutputStream(vaultFile, false)) {
                    fos.write(new byte[(int) len]);
                    fos.getFD().sync();
                }
            }
        } catch (Exception ignored) {
            // Proceed to delete
        }
        return vaultFile.delete();
    }

    private static byte[] readAllBytes(File file) throws Exception {
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[1024];
            int read;
            while ((read = fis.read(buf)) != -1) {
                bos.write(buf, 0, read);
            }
            return bos.toByteArray();
        }
    }
}
