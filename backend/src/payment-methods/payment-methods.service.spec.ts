import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaymentMethodKind } from '../database/enums';
import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PaymentMethodsService);
  });

  it('rechaza CRYPTO con una moneda distinta de USD', async () => {
    await expect(
      service.create({ id: 'admin-1' } as never, {
        code: 'usdt-malo',
        name: 'USDT',
        kind: PaymentMethodKind.CRYPTO,
        currencies: ['PEN'],
        instructions: {},
      }),
    ).rejects.toThrow('Los métodos CRYPTO solo admiten USD');
  });

  it('rechaza CRYPTO con más de una moneda', async () => {
    await expect(
      service.create({ id: 'admin-1' } as never, {
        code: 'usdt-malo-2',
        name: 'USDT',
        kind: PaymentMethodKind.CRYPTO,
        currencies: ['PEN', 'USD'],
        instructions: {},
      }),
    ).rejects.toThrow('Los métodos CRYPTO solo admiten USD');
  });
});
