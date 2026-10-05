import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  planId!: string;

  /** Solo si el producto se activa sobre la cuenta del cliente en la herramienta. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toolUsername?: string;
}
