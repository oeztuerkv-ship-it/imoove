/**
 * Transportschein-Uploads: nur JPEG/PNG, Größe und Magic-Bytes — keine beliebigen Binärtypen.
 */

/** Dekodiertes Bild maximal (Upload-Schutz). */
export const MEDICAL_TRANSPORT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

/** Roher Base64-/Data-URL-String Obergrenze (ca. 4/3 × Bytes + Präfix). */
export const MEDICAL_TRANSPORT_BASE64_MAX_CHARS = Math.ceil(MEDICAL_TRANSPORT_IMAGE_MAX_BYTES / 3) * 4 + 512;

export type DecodeMedicalImageResult =
  | { ok: true; buffer: Buffer; ext: "jpg" | "png"; mime: "image/jpeg" | "image/png" }
  | { ok: false; error: string };

function sniffImageMagic(buf: Buffer): "image/jpeg" | "image/png" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  return null;
}

/**
 * Akzeptiert nur `data:image/jpeg;base64,...` / `data:image/png;base64,...` oder rohes Base64 (nach Decode Magic-Bytes).
 */
export function decodeValidatedMedicalTransportImage(input: string): DecodeMedicalImageResult {
  const trimmed = input.trim();
  if (trimmed.length > MEDICAL_TRANSPORT_BASE64_MAX_CHARS) {
    return { ok: false, error: "payload_too_large" };
  }

  let declaredMime: "image/jpeg" | "image/png" | null = null;
  let b64part = trimmed.replace(/\s/g, "");

  const dm = trimmed.match(/^data:image\/(jpeg|png);base64,/i);
  if (dm) {
    declaredMime = dm[1]!.toLowerCase() === "jpeg" ? "image/jpeg" : "image/png";
    b64part = trimmed.slice(dm[0].length).replace(/\s/g, "");
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64part)) {
    return { ok: false, error: "invalid_base64_chars" };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64part, "base64");
  } catch {
    return { ok: false, error: "invalid_base64" };
  }

  if (!buf.length) return { ok: false, error: "empty_image" };
  if (buf.length > MEDICAL_TRANSPORT_IMAGE_MAX_BYTES) return { ok: false, error: "image_size_invalid" };

  const magic = sniffImageMagic(buf);
  if (!magic) return { ok: false, error: "unsupported_or_corrupt_image" };
  if (declaredMime && declaredMime !== magic) return { ok: false, error: "mime_magic_mismatch" };

  const ext = magic === "image/jpeg" ? "jpg" : "png";
  return { ok: true, buffer: buf, ext, mime: magic };
}
