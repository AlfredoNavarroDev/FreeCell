import { ApiProperty } from '@nestjs/swagger';

export class CreateBatchResultDto {
  @ApiProperty() batchId!: string;
  @ApiProperty() loadedCount!: number;
  @ApiProperty() duplicateCount!: number;
  @ApiProperty() errorCount!: number;
}
