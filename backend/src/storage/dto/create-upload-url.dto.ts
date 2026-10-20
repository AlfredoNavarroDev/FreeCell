import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import {
  ALLOWED_PROOF_MIME_TYPES,
  MAX_PROOF_FILE_SIZE_BYTES,
} from '../storage.constants';
import type { AllowedProofMimeType } from '../storage.constants';

const ALLOWED_CONTENT_TYPES = Object.keys(
  ALLOWED_PROOF_MIME_TYPES,
) as AllowedProofMimeType[];

export class CreateUploadUrlDto {
  @ApiProperty({ enum: ALLOWED_CONTENT_TYPES })
  @IsIn(ALLOWED_CONTENT_TYPES, {
    message: 'El comprobante debe ser JPG, PNG o PDF',
  })
  contentType!: AllowedProofMimeType;

  @ApiProperty({ minimum: 1, maximum: MAX_PROOF_FILE_SIZE_BYTES })
  @IsInt({ message: 'fileSizeBytes debe ser un número entero' })
  @Min(1, { message: 'fileSizeBytes debe ser mayor a 0' })
  @Max(MAX_PROOF_FILE_SIZE_BYTES, {
    message: 'El comprobante no puede superar 5 MB',
  })
  fileSizeBytes!: number;
}
