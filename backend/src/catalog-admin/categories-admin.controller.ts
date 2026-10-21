import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { CategoriesAdminService } from './categories-admin.service';
import { CategoryAdminResponseDto } from './dto/category-admin-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesAdminService) {}

  @Get()
  list(): Promise<CategoryAdminResponseDto[]> {
    return this.categories.list();
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    return this.categories.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    return this.categories.update(admin, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.categories.remove(admin, id);
  }
}
