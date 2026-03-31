/**
 * 数据库种子脚本
 *
 * 用途：
 * - 初始化管理员账号
 * - 用于开发环境或新部署时快速创建初始数据
 *
 * 执行方式：
 * pnpm seed
 *
 * 配置说明：
 * 通过环境变量自定义管理员账号（可选）：
 * - SEED_ADMIN_USERNAME：管理员用户名（默认：admin）
 * - SEED_ADMIN_PHONE：管理员手机号（默认：13800000000）
 * - SEED_ADMIN_PASSWORD：管理员密码（默认：Admin123456!）
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * 主函数
 *
 * 创建或更新管理员账号：
 * 1. 从环境变量读取配置（或默认值）
 * 2. bcrypt 加密密码
 * 3. 使用 upsert 操作（存在则更新，不存在则创建）
 * 4. 输出日志
 */
async function main() {
  console.log('Start seeding...');

  // ==================== 1. 创建部门 ====================
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { name: '研发部' },
      update: {},
      create: { name: '研发部', description: '负责产品研发和技术支持' },
    }),
    prisma.department.upsert({
      where: { name: '人事部' },
      update: {},
      create: { name: '人事部', description: '负责人力资源和行政管理' },
    }),
    prisma.department.upsert({
      where: { name: '销售部' },
      update: {},
      create: { name: '销售部', description: '负责市场销售和客户关系' },
    }),
  ]);

  console.log('Created departments:', departments.map(d => d.name));

  // 从环境变量读取管理员配置
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPhone = process.env.SEED_ADMIN_PHONE || '13800000000';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123456!';

  // bcrypt 加密密码（10 轮盐）
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // 获取研发部 ID
  const engineeringDept = departments.find(d => d.name === '研发部');

  // upsert：存在则更新（空更新），不存在则创建
  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      phone: adminPhone,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      departmentId: engineeringDept?.id,
    },
  });

  console.log('Created admin user:', {
    username: admin.username,
    role: admin.role,
    department: engineeringDept?.name,
  });

  // 创建普通用户测试账号
  const userPassword = process.env.SEED_USER_PASSWORD || 'User123456!';
  const userPasswordHash = await bcrypt.hash(userPassword, 10);

  const testUser = await prisma.user.upsert({
    where: { username: 'user1' },
    update: {},
    create: {
      username: 'user1',
      phone: '13800000001',
      passwordHash: userPasswordHash,
      role: 'USER',
      status: 'ACTIVE',
      departmentId: engineeringDept?.id,
    },
  });

  console.log('Created test user:', {
    username: testUser.username,
    role: testUser.role,
    department: engineeringDept?.name,
  });

  console.log('Seeding finished.');
}

// 执行种子脚本
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
