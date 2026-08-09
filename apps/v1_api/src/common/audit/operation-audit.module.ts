import { Module } from '@nestjs/common';
import { OperationAuditWriterService } from './operation-audit-writer.service';

@Module({
  providers: [OperationAuditWriterService],
  exports: [OperationAuditWriterService],
})
export class OperationAuditModule {}
