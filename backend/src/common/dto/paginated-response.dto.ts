export class PaginatedResponseDto<T> {
  items!: T[];
  total!: number;
  page!: number;
  pageSize!: number;

  static from<T>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
  ): PaginatedResponseDto<T> {
    return { items, total, page, pageSize };
  }
}
