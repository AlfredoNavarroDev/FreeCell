import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { EnvironmentVariables } from '../core/config/env.validation';
import {
  ALLOWED_PROOF_MIME_TYPES,
  UPLOAD_URL_TTL_SECONDS,
} from './storage.constants';
import type { AllowedProofMimeType } from './storage.constants';

export interface ProofUploadUrl {
  uploadUrl: string;
  proofKey: string;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    this.bucket = config.get('R2_BUCKET', { infer: true });
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('R2_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  /**
   * Firma una URL de subida privada para un comprobante de pago (RNF-SEG-09).
   * El tipo y el tamaño ya se validaron en el DTO; al firmar con `ContentType`,
   * R2 exige que la subida real use el mismo header `Content-Type`.
   */
  async createProofUploadUrl(
    orderId: string,
    contentType: AllowedProofMimeType,
  ): Promise<ProofUploadUrl> {
    const ext = ALLOWED_PROOF_MIME_TYPES[contentType];
    const proofKey = `proofs/${orderId}/${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: proofKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
    return { uploadUrl, proofKey };
  }
}
