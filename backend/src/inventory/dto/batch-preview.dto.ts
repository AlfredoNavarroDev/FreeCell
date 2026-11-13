import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUUID } from 'class-validator';

export class BatchPreviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'planId debe ser un UUID' })
  planId!: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'secrets debe ser una lista' })
  @ArrayMinSize(1, { message: 'secrets necesita al menos una línea' })
  @IsString({ each: true, message: 'Cada secreto debe ser texto' })
  secrets!: string[];
}
