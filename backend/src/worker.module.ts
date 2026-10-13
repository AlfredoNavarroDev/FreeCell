import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { WorkersModule } from './workers.module';

/** Proceso worker: infraestructura + processors, sin HTTP. */
@Module({
  imports: [CoreModule, WorkersModule],
})
export class WorkerModule {}
