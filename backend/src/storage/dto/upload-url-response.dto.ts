import { ApiProperty } from '@nestjs/swagger';

export class UploadUrlResponseDto {
  @ApiProperty()
  uploadUrl!: string;

  @ApiProperty()
  proofKey!: string;

  static from(uploadUrl: string, proofKey: string): UploadUrlResponseDto {
    const dto = new UploadUrlResponseDto();
    dto.uploadUrl = uploadUrl;
    dto.proofKey = proofKey;
    return dto;
  }
}
