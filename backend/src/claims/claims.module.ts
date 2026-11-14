import { Module } from '@nestjs/common';
import { AdminClaimsController } from './admin-claims.controller';
import { AdminClaimsService } from './admin-claims.service';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  controllers: [ClaimsController, AdminClaimsController],
  providers: [ClaimsService, AdminClaimsService],
})
export class ClaimsModule {}
