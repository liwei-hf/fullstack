import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { PromptTemplateListItem } from '@fullstack/shared';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Database, MessageSquareText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const SCENE_LABELS: Record<PromptTemplateListItem['scene'], string> = {
  nl2sql: '智能问数',
  rag: '知识库问答',
};

const ICON_BY_CODE: Record<PromptTemplateListItem['code'], ComponentType<{ className?: string }>> = {
  sql_generation: Database,
  sql_answer: Bot,
  knowledge_base_answer: MessageSquareText,
};

export default function PromptTemplateListPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<PromptTemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const response = await api.get<PromptTemplateListItem[]>('/ai/prompts/templates');
        setItems(response);
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : '获取提示词模板失败',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchTemplates();
  }, [toast]);

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="提示词管理"
          description="统一维护系统提示词模板，针对智能问数与知识库问答直接编辑当前内容并进入测试台验证效果。"
        />

        <div className="grid gap-5 xl:grid-cols-3">
          {loading ? (
            <div className="rounded-[24px] border border-slate-200/80 bg-white px-6 py-10 text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
              加载中...
            </div>
          ) : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-[24px] border border-slate-200/80 bg-white px-6 py-10 text-sm text-slate-500 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
              当前还没有可管理的提示词模板。
            </div>
          ) : null}

          {items.map((item) => {
            const Icon = ICON_BY_CODE[item.code];

            return (
              <Card
                key={item.id}
                className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]"
              >
                <CardContent className="flex min-h-[250px] flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="outline">{SCENE_LABELS[item.scene]}</Badge>
                  </div>

                  <div className="mt-6 space-y-3">
                    <h2 className="text-xl font-semibold text-slate-900">{item.name}</h2>
                    <p className="text-sm leading-7 text-slate-500">
                      {item.description || '当前模板暂无额外描述。'}
                    </p>
                  </div>

                  <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    最近更新：
                    <span className="ml-2 font-medium text-slate-900">
                      {new Date(item.updatedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>

                  <div className="mt-auto pt-6">
                    <Button asChild className="w-full rounded-2xl bg-[#3B82F6] hover:bg-blue-600">
                      <Link to={`/ai/prompts/${item.code}`}>
                        进入编辑
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <Toaster />
    </>
  );
}
