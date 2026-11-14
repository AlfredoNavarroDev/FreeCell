import { Module } from '@nestjs/common';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, AdminSupportService],
})
export class SupportModule {}
