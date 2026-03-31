/**
 * 部门控制器
 *
 * 提供部门管理相关的 HTTP 接口：
 * - GET /api/departments - 获取部门列表
 * - GET /api/departments/:id - 获取部门详情
 * - POST /api/departments - 创建部门
 * - PATCH /api/departments/:id - 更新部门
 * - DELETE /api/departments/:id - 删除部门
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  /**
   * 获取部门列表
   */
  @Get()
  async findAll() {
    return { data: await this.departmentsService.findAll() };
  }

  /**
   * 获取部门详情
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.departmentsService.findOne(id) };
  }

  /**
   * 创建部门
   */
  @Post()
  async create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return { data: await this.departmentsService.create(createDepartmentDto) };
  }

  /**
   * 更新部门
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
  ) {
    return { data: await this.departmentsService.update(id, updateDepartmentDto) };
  }

  /**
   * 删除部门
   */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.departmentsService.remove(id) };
  }
}
