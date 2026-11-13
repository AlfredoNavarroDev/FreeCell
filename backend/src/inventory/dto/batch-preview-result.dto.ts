import { ApiProperty } from '@nestjs/swagger';

export class BatchPreviewResultDto {
  @ApiProperty() validCount!: number;
  @ApiProperty() duplicateCount!: number;
  @ApiProperty() errorCount!: number;
}
