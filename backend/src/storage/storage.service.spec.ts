import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string): string =>
              ({
                R2_ACCOUNT_ID: 'acc123',
                R2_ACCESS_KEY_ID: 'key123',
                R2_SECRET_ACCESS_KEY: 'secret123',
                R2_BUCKET: 'freecell-proofs',
              })[key] as string,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StorageService);
  });

  it('firma una URL con el bucket y una extensión según el tipo de contenido', async () => {
    const { uploadUrl, proofKey } = await service.createProofUploadUrl(
      'order-1',
      'image/png',
    );
    expect(proofKey).toMatch(/^proofs\/order-1\/[0-9a-f-]{36}\.png$/);
    expect(uploadUrl).toContain('freecell-proofs');
    expect(uploadUrl).toContain('X-Amz-Signature');
  });

  it('usa la extensión correcta para cada tipo permitido', async () => {
    const jpg = await service.createProofUploadUrl('order-1', 'image/jpeg');
    const pdf = await service.createProofUploadUrl(
      'order-1',
      'application/pdf',
    );
    expect(jpg.proofKey).toMatch(/\.jpg$/);
    expect(pdf.proofKey).toMatch(/\.pdf$/);
  });

  it('genera una clave distinta en cada llamada (sin colisiones)', async () => {
    const first = await service.createProofUploadUrl(
      'order-1',
      'application/pdf',
    );
    const second = await service.createProofUploadUrl(
      'order-1',
      'application/pdf',
    );
    expect(first.proofKey).not.toBe(second.proofKey);
  });

  it('firma una URL de lectura del comprobante para el admin', async () => {
    const url = await service.createProofDownloadUrl('proofs/order-1/x.png');
    expect(url).toContain('freecell-proofs');
    expect(url).toContain('X-Amz-Signature');
  });
});
