package com.controlgastos.seguridad;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Digest de contraseña antes de BCrypt.
 * En tránsito no viaja la contraseña en claro; en BD solo queda BCrypt (irreversible).
 */
public final class PasswordDigests {

    private PasswordDigests() {
    }

    public static String sha256Hex(String textoPlano) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(textoPlano.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
