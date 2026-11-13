import { ApiProperty } from '@nestjs/swagger';

/** Licencia AVAILABLE de un plan: nunca incluye la clave (regla 4). */
export class AvailableLicenseDto {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
}
