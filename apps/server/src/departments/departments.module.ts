/**
 * 部门模块
 */
import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  imports: [PrismaModule],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
