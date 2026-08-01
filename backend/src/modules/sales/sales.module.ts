import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { DraftsService } from './drafts.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, DraftsService],
  exports: [SalesService],
})
export class SalesModule {}
