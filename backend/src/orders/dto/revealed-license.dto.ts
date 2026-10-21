import { ApiProperty } from '@nestjs/swagger';

export class RevealedLicenseDto {
  @ApiProperty() orderItemId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ description: 'Clave en claro (regla 4: nunca se audita este valor)' })
  secret!: string;
}
