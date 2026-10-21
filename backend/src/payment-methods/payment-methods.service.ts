import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { type Currency } from '../database/currency';
import { PaymentMethod } from '../database/entities';
import { PaymentMethodKind } from '../database/enums';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodResponseDto } from './dto/payment-method-response.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async listActive(currency?: Currency): Promise<PaymentMethodResponseDto[]> {
    const qb = this.ds
      .getRepository(PaymentMethod)
      .createQueryBuilder('pm')
      .where('pm.active = true')
      .orderBy('pm.sortOrder', 'ASC');
    if (currency) {
      qb.andWhere(':currency = ANY(pm.currencies)', { currency });
    }
    const rows = await qb.getMany();
    return rows.map((row) => PaymentMethodResponseDto.from(row));
  }

  async listAll(): Promise<PaymentMethodResponseDto[]> {
    const rows = await this.ds.getRepository(PaymentMethod).find({
      order: { sortOrder: 'ASC' },
    });
    return rows.map((row) => PaymentMethodResponseDto.from(row));
  }

  async create(
    admin: AuthenticatedUser,
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    this.assertCryptoIsUsdOnly(dto.kind, dto.currencies);
    const created = await this.ds.transaction(async (m) => {
      const row = await m.save(
        PaymentMethod,
        m.create(PaymentMethod, {
          code: dto.code,
          name: dto.name,
          kind: dto.kind,
          currencies: dto.currencies,
          instructions: dto.instructions,
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
        }),
      );
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'payment_method.created',
        entity: 'payment_method',
        entityId: row.id,
        meta: { code: row.code, kind: row.kind },
      });
      return row;
    });
    return PaymentMethodResponseDto.from(created);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    const current = await this.ds.getRepository(PaymentMethod).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Método de pago no encontrado');
    }
    this.assertCryptoIsUsdOnly(
      dto.kind ?? current.kind,
      dto.currencies ?? current.currencies,
    );

    const updated = await this.ds.transaction(async (m) => {
      // El cast es necesario porque TypeORM no tipa bien columnas `jsonb` genéricas
      // (Record<string, unknown> | undefined) dentro de QueryDeepPartialEntity (mismo
      // patrón que AuditService.log para `audit_logs.meta`).
      await m.update(
        PaymentMethod,
        { id },
        dto as unknown as QueryDeepPartialEntity<PaymentMethod>,
      );
      const row = await m.findOneByOrFail(PaymentMethod, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'payment_method.updated',
        entity: 'payment_method',
        entityId: id,
        meta: dto as Record<string, unknown>,
      });
      return row;
    });
    return PaymentMethodResponseDto.from(updated);
  }

  private assertCryptoIsUsdOnly(kind: PaymentMethodKind, currencies: Currency[]): void {
    if (
      kind === PaymentMethodKind.CRYPTO &&
      (currencies.length !== 1 || currencies[0] !== 'USD')
    ) {
      throw new BadRequestException('Los métodos CRYPTO solo admiten USD');
    }
  }
}
