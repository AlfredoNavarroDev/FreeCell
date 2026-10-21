import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Plan, PlanPrice } from '../database/entities';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanAdminResponseDto } from './dto/plan-admin-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(
    admin: AuthenticatedUser,
    dto: CreatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    const created = await this.ds.transaction(async (m) => {
      const plan = await m.save(
        Plan,
        m.create(Plan, {
          productId: dto.productId,
          name: dto.name,
          kind: dto.kind ?? undefined,
          durationDays: dto.durationDays,
          lowStockThreshold: dto.lowStockThreshold ?? undefined,
          active: dto.active ?? true,
        }),
      );
      for (const price of dto.prices) {
        await m.save(
          PlanPrice,
          m.create(PlanPrice, {
            planId: plan.id,
            currency: price.currency,
            priceCents: price.priceCents,
          }),
        );
      }
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'plan.created',
        entity: 'plan',
        entityId: plan.id,
        meta: { productId: plan.productId, prices: dto.prices },
      });
      return plan;
    });
    return PlanAdminResponseDto.from(created, dto.prices);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    const current = await this.ds.getRepository(Plan).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Plan no encontrado');
    }
    const { prices, ...fields } = dto;

    const updated = await this.ds.transaction(async (m) => {
      if (Object.keys(fields).length > 0) {
        await m.update(Plan, { id }, fields);
      }
      if (prices) {
        for (const price of prices) {
          await m.query(
            `INSERT INTO plan_prices ("planId", currency, "priceCents")
             VALUES ($1, $2, $3)
             ON CONFLICT ("planId", currency) DO UPDATE SET "priceCents" = EXCLUDED."priceCents"`,
            [id, price.currency, price.priceCents],
          );
        }
      }
      const row = await m.findOneByOrFail(Plan, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'plan.updated',
        entity: 'plan',
        entityId: id,
        meta: { ...fields, prices: prices ?? undefined },
      });
      return row;
    });

    const priceRows: { currency: 'PEN' | 'USD'; priceCents: number }[] =
      await this.ds.query(
        `SELECT currency, "priceCents" FROM plan_prices WHERE "planId" = $1 ORDER BY currency`,
        [id],
      );
    return PlanAdminResponseDto.from(updated, priceRows);
  }
}
