import { Module } from '@nestjs/common';
import { OperationalAlertsModule } from './operational-alerts.module';
import { OperationalAlertsProcessor } from './operational-alerts.processor';

@Module({
  imports: [OperationalAlertsModule],
  providers: [OperationalAlertsProcessor],
})
export class OperationalAlertsWorkerModule {}
