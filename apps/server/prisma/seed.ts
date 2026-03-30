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
 * - SEED_ADMIN_NICKNAME：管理员昵称（默认：系统管理员）
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

  // 从环境变量读取管理员配置
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPhone = process.env.SEED_ADMIN_PHONE || '13800000000';
  const adminNickname = process.env.SEED_ADMIN_NICKNAME || '系统管理员';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123456!';

  // bcrypt 加密密码（10 轮盐）
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // upsert：存在则更新（空更新），不存在则创建
  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      phone: adminPhone,
      passwordHash,
      nickname: adminNickname,
      avatar: null,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Created admin user:', {
    username: admin.username,
    role: admin.role,
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
