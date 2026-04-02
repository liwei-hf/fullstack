import { Activity, Bot, Database, FileStack, MessageSquareText, Sparkles, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useAuthStore } from '@/store/auth-store';

const summaryCards = [
  { title: '知识库总数', value: '12', hint: '本周新增 2 个', icon: Database },
  { title: '处理中任务', value: '8', hint: '含 ZIP 批量导入', icon: FileStack },
  { title: '今日问答数', value: '146', hint: '较昨日 +18%', icon: MessageSquareText },
  { title: '活跃管理员', value: '6', hint: '近 24 小时有操作', icon: Users },
];

const activityItems = [
  '智能问数：今天完成了哪些待办？',
  '知识库问答：道路交通知识库已更新 3 份文档',
  'Prompt 管理：知识库问答模板已保存',
  '文档处理：员工手册.pdf 已进入 READY',
];

const processingItems = [
  { name: '中华人民共和国道路交通安全法.docx', status: '处理中', hint: '预计 10-30 秒' },
  { name: 'React 文档 ZIP 批量导入', status: '排队中', hint: '等待 worker 处理' },
  { name: '客户 FAQ 汇总包.zip', status: '部分成功', hint: '2 个文件失败待排查' },
];

/**
 * 仪表盘
 *
 * 这里不做传统重图表 Dashboard，而是更像 AI SaaS 首页：
 * 先给系统概览，再给最近 AI 活动和处理中任务，方便进入具体工作流。
 */
export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="仪表盘"
        description={`欢迎回来，${user?.username || '管理员'}。这里聚合最近的 AI 活动、知识库状态与系统概览，方便你快速回到当前最重要的工作。`}
      />

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <CardContent className="grid gap-5 p-6 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <div
                key={item.title}
                className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{item.title}</p>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">{item.value}</p>
                <p className="mt-2 text-sm text-slate-500">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-200/80 bg-[linear-gradient(135deg,#3B82F6_0%,#60A5FA_100%)] text-white shadow-[0_20px_50px_rgba(59,130,246,0.22)]">
          <CardContent className="space-y-5 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Bot className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">AI 工作台已就绪</h2>
              <p className="max-w-md text-sm leading-7 text-blue-50/90">
                你可以从这里进入知识库问答、智能问数、Prompt 管理和问答日志，统一维护整个 AI 工作流。
              </p>
            </div>
            <div className="grid gap-3 text-sm text-blue-50/95 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/12 px-4 py-3">知识库：支持单文件与 ZIP 导入</div>
              <div className="rounded-2xl bg-white/12 px-4 py-3">问答日志：统一追踪 requestId / SQL / think</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-blue-500" />
              最近 AI 活动
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityItems.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                <p className="text-sm text-slate-700">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-blue-500" />
              处理中任务
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {processingItems.map((item) => (
              <div key={item.name} className="rounded-2xl border border-slate-200/80 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{item.name}</p>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{item.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
