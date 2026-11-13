import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class UpdateUsdRateDto {
  @ApiProperty({ minimum: 0, exclusiveMinimum: true })
  @IsNumber({}, { message: 'rate debe ser un número' })
  @IsPositive({ message: 'rate debe ser mayor a 0' })
  rate!: number;
}
