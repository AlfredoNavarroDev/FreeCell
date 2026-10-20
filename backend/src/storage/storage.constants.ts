/** D70: comprobante de pago máx. 5 MB, JPG/PNG/PDF; URL firmada de subida válida 5 min. */
export const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_PROOF_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
} as const;

export type AllowedProofMimeType = keyof typeof ALLOWED_PROOF_MIME_TYPES;

export const UPLOAD_URL_TTL_SECONDS = 300;
