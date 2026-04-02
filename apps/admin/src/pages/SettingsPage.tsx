import { Bell, Database, Palette, Settings as SettingsIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

const settingGroups = [
  {
    title: '通用设置',
    description: '系统名称、默认文案、站点信息与基础配置。',
    icon: SettingsIcon,
  },
  {
    title: '通知设置',
    description: '邮件、短信与系统消息的发送策略。',
    icon: Bell,
  },
  {
    title: '安全设置',
    description: '登录策略、访问控制与审计能力。',
    icon: Shield,
  },
  {
    title: '数据管理',
    description: '备份、恢复、导入导出与保留策略。',
    icon: Database,
  },
  {
    title: '外观设置',
    description: '品牌色、布局密度与界面风格配置。',
    icon: Palette,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="按模块组织系统配置，让通用设置、安全控制和数据管理保持同一套轻卡片工作台风格。"
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {settingGroups.map((group) => (
          <Card
            key={group.title}
            className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]"
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                  <group.icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{group.title}</CardTitle>
                  <CardDescription className="mt-1 leading-6">{group.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500">
                该模块保留为系统设置扩展位，后续可逐步接入真实配置表单。
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="rounded-2xl">
          恢复默认
        </Button>
        <Button className="rounded-2xl bg-[#3B82F6] hover:bg-blue-600">保存设置</Button>
      </div>
    </div>
  );
}
