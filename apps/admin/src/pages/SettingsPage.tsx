import { useEffect, useMemo, useState } from 'react';
import type { AiSettings, AiSqlVisibility } from '@fullstack/shared';
import { Bell, BrainCircuit, Database, Eye, EyeOff, Palette, Settings as SettingsIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const settingGroups = [
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

const sqlVisibilityOptions: Array<{
  value: AiSqlVisibility;
  label: string;
  description: string;
  icon: typeof Eye;
}> = [
  {
    value: 'visible',
    label: '可见',
    description: '所有登录用户都能看到智能问数生成的 SQL，适合内部演示或排查场景。',
    icon: Eye,
  },
  {
    value: 'hidden',
    label: '不可见',
    description: '所有用户都只看到自然语言回答，不回传 SQL，安全边界最严格。',
    icon: EyeOff,
  },
  {
    value: 'admin_only',
    label: '仅管理员可见',
    description: '管理员可以查看 SQL，普通用户只看回答，适合作为默认生产策略。',
    icon: Shield,
  },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [draftVisibility, setDraftVisibility] = useState<AiSqlVisibility>('admin_only');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedVisibility = useMemo(
    () => sqlVisibilityOptions.find((item) => item.value === draftVisibility) ?? sqlVisibilityOptions[2]!,
    [draftVisibility],
  );

  const dirty = settings?.sqlVisibility !== draftVisibility;

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get<AiSettings>('/admin/settings/ai');
        setSettings(response);
        setDraftVisibility(response.sqlVisibility);
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : '加载设置失败',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.patch<AiSettings>('/admin/settings/ai', {
        sqlVisibility: draftVisibility,
      });
      setSettings(response);
      setDraftVisibility(response.sqlVisibility);
      toast({ title: '设置已保存' });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '保存设置失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    setDraftVisibility('admin_only');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="把高影响的系统开关收口在统一配置页里，先从智能问数 SQL 展示策略开始。"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <CardHeader className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <CardTitle>AI 设置</CardTitle>
                <CardDescription className="leading-6">
                  控制智能问数是否把生成 SQL 回传给前端展示。配置保存后，新的问答请求会立即按新策略生效。
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">智能问数 SQL 可见性</p>
                <p className="text-sm leading-6 text-slate-500">
                  推荐生产环境使用“仅管理员可见”，既方便排查生成结果，也避免把 SQL 直接暴露给普通用户。
                </p>
              </div>

              <Select value={draftVisibility} onValueChange={(value) => setDraftVisibility(value as AiSqlVisibility)}>
                <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-sm shadow-none focus:ring-blue-200">
                  <SelectValue placeholder="选择 SQL 可见性策略" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200">
                  {sqlVisibilityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {sqlVisibilityOptions.map((option) => {
                const active = option.value === draftVisibility;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDraftVisibility(option.value)}
                    className={`rounded-[20px] border p-4 text-left transition ${
                      active
                        ? 'border-blue-200 bg-blue-50/70 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <option.icon className={`h-4 w-4 ${active ? 'text-blue-500' : 'text-slate-400'}`} />
                      {option.label}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{option.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium tracking-[0.16em] text-slate-400">当前预览</p>
              <div className="mt-3 flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm">
                  <selectedVisibility.icon className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{selectedVisibility.label}</p>
                  <p className="text-sm leading-6 text-slate-500">{selectedVisibility.description}</p>
                  <p className="text-xs text-slate-400">
                    {loading
                      ? '正在读取当前配置...'
                      : `当前已生效：${
                          settings?.sqlVisibility === 'visible'
                            ? '可见'
                            : settings?.sqlVisibility === 'hidden'
                              ? '不可见'
                              : '仅管理员可见'
                        }`}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleResetDefault}
                disabled={loading || saving}
              >
                恢复默认
              </Button>
              <Button
                className="rounded-2xl bg-[#3B82F6] hover:bg-blue-600"
                onClick={handleSave}
                disabled={loading || saving || !dirty}
              >
                {saving ? '保存中...' : '保存设置'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <SettingsIcon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>配置说明</CardTitle>
                  <CardDescription className="mt-1 leading-6">
                    后台保存后优先走数据库配置；如果数据库里没有记录，再回退到环境变量。
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              <p>1. 可见：适合内部测试或需要快速校验提示词生成结果的场景。</p>
              <p>2. 不可见：适合对 SQL 泄露比较敏感的演示或外部环境。</p>
              <p>3. 仅管理员可见：兼顾可排查性和安全边界，作为默认推荐值。</p>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            {settingGroups.map((group) => (
              <Card
                key={group.title}
                className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]"
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                      <group.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>{group.title}</CardTitle>
                      <CardDescription className="mt-1 leading-6">{group.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                    该模块继续保留为系统设置扩展位，后续可沿用当前 SystemSetting 模型逐步接入真实表单。
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
