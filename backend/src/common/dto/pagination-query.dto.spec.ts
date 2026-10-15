import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('usa page=1 y pageSize=20 por defecto', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza pageSize mayor a 50', async () => {
    const dto = plainToInstance(PaginationQueryDto, { pageSize: '51' });
    const errors = await validate(dto);
    expect(errors[0]?.property).toBe('pageSize');
  });

  it('rechaza page menor a 1', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors[0]?.property).toBe('page');
  });
});
