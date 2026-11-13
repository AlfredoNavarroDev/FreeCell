import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [SettingsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
