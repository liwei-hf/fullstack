/**
 * 部门服务
 *
 * 核心职责：
 * - 部门 CRUD 操作
 * - 部门列表查询
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取部门列表
   */
  async findAll() {
    const departments = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    return departments.map((dept) => ({
      ...dept,
      userCount: dept._count.users,
      _count: undefined,
    }));
  }

  /**
   * 根据 ID 查找部门
   */
  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return {
      ...department,
      userCount: department._count.users,
      _count: undefined,
    };
  }

  /**
   * 创建部门
   */
  async create(dto: CreateDepartmentDto) {
    // 检查名称是否已存在
    const existing = await this.prisma.department.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new NotFoundException('Department name already exists');
    }

    return this.prisma.department.create({
      data: dto,
    });
  }

  /**
   * 更新部门
   */
  async update(id: string, dto: UpdateDepartmentDto) {
    // 检查部门是否存在
    await this.findOne(id);

    // 如果修改了名称，检查新名称是否已被使用
    if (dto.name) {
      const existing = await this.prisma.department.findFirst({
        where: {
          name: dto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new NotFoundException('Department name already exists');
      }
    }

    return this.prisma.department.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * 删除部门
   */
  async remove(id: string) {
    const department = await this.findOne(id);

    // 如果部门下有用户，不允许删除
    if (department.userCount > 0) {
      throw new NotFoundException('Cannot delete department with users');
    }

    await this.prisma.department.delete({
      where: { id },
    });

    return { success: true };
  }
}
