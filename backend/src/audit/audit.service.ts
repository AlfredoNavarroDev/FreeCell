import { Injectable } from '@nestjs/common';
import type { EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { AuditLog } from '../database/entities';
import { sanitizeMeta } from './sanitize-meta';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  /**
   * Recibe el EntityManager de la transacción del llamador: la auditoría se confirma
   * o se revierte junto con la mutación que describe (regla 6).
   */
  async log(manager: EntityManager, entry: AuditEntry): Promise<void> {
    // El cast es necesario porque TypeORM no tipa bien columnas `jsonb` genéricas
    // (Record<string, unknown> | null) dentro de QueryDeepPartialEntity: `unknown`
    // podría incluir null/undefined, que no son asignables al tipo recursivo.
    const row = {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      meta: entry.meta
        ? (sanitizeMeta(entry.meta) as Record<string, unknown>)
        : null,
    } as unknown as QueryDeepPartialEntity<AuditLog>;
    await manager.insert(AuditLog, row);
  }
}
