import { Module } from '@nestjs/common';
import { OrdersModule } from './orders.module';
import { OrdersProcessor } from './orders.processor';

@Module({
  imports: [OrdersModule],
  providers: [OrdersProcessor],
})
export class OrdersWorkerModule {}
