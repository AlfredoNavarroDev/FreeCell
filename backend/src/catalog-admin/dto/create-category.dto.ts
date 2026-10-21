import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 80, { message: 'name admite hasta 80 caracteres' })
  name!: string;
}
