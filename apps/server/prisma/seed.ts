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

  const knowledgeBaseSeeds = [
    {
      name: '交通法规知识库',
      description:
        '包含道路交通相关法律法规、处罚标准与扣分规则，涵盖违停、闯红灯、超速等交通违法行为的处理方式、处罚金额，适用于交通规则查询与法规解释。',
      suggestedQuestions: [
        '闯红灯会怎么处罚？罚款多少，扣多少分？',
        '违停一般怎么处理？哪些情况会被拖车？',
        '超速 20%、50% 以上分别怎么处罚？',
        '驾驶证记分规则里，哪些违法行为扣分最多？',
        '如果发生轻微交通事故，法律上应该怎么处理？',
      ],
    },
    {
      name: '企业制度知识库',
      description:
        '包含企业内部管理制度与员工手册内容，如考勤规则、请假流程、报销规范、出差制度与绩效相关规定，适用于员工日常制度查询与流程说明。',
      suggestedQuestions: [
        '这份员工手册里对请假流程是怎么规定的？',
        '病假、事假、年假分别需要提交哪些材料？',
        '报销流程怎么走？有哪些费用不能报销？',
        '考勤迟到、早退、旷工分别怎么认定和处理？',
        '出差申请和差旅报销有哪些标准或限制？',
      ],
    },
    {
      name: '技术文档知识库',
      description: 'vue、react文档',
      suggestedQuestions: [
        '这个 API 是做什么的？适合在什么场景下使用？',
        '这个参数分别表示什么？哪些是必填，哪些是可选？',
        '给我一个最简单的调用示例',
        '这个 API 返回什么结果？常见返回结构怎么理解？',
        '使用这个 API 时有哪些注意事项或常见错误？',
      ],
    },
  ] as const;

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

  // 创建或更新演示用知识库基础数据。
  // 这样新环境首次初始化和线上重复执行 seed 时，都能把推荐问题同步到同名知识库上。
  const seededKnowledgeBases = await Promise.all(
    knowledgeBaseSeeds.map((item) =>
      prisma.knowledgeBase.upsert({
        where: { name: item.name },
        update: {
          description: item.description,
          suggestedQuestions: item.suggestedQuestions.slice(),
        },
        create: {
          name: item.name,
          description: item.description,
          suggestedQuestions: item.suggestedQuestions.slice(),
          createdById: admin.id,
        },
      }),
    ),
  );

  console.log(
    'Seeded knowledge bases:',
    seededKnowledgeBases.map((item) => ({
      name: item.name,
      suggestedQuestionCount: item.suggestedQuestions.length,
    })),
  );

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
