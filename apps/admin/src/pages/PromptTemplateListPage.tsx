import { useEffect, useState } from 'react';
import type { PromptTemplateListItem } from '@fullstack/shared';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const SCENE_LABELS: Record<PromptTemplateListItem['scene'], string> = {
  nl2sql: '智能问数',
  rag: '知识库问答',
};

/**
 * Prompt 模板列表页
 *
 * 列表页只负责浏览模板概况和进入详情，
 * 这样后台入口会更像标准的“列表 -> 详情”管理模式。
 */
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
          title: error instanceof Error ? error.message : '获取 Prompt 模板失败',
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
        <Card>
          <CardHeader>
            <CardTitle>Prompt 模板列表</CardTitle>
            <p className="text-sm text-muted-foreground">
              先选择模板，再进入详情页维护版本、测试效果和查看日志。
            </p>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">加载中...</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">当前还没有可管理的 Prompt 模板。</p>
            )}

            <TooltipProvider>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <Card key={item.id} className="border-slate-200 shadow-sm">
                    <CardContent className="flex min-h-[220px] flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="truncate text-base font-semibold text-slate-900">
                                {item.name}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>{item.name}</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="mt-1 line-clamp-2 min-h-[40px] text-sm text-slate-500">
                                {item.description || '暂无描述'}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              {item.description || '暂无描述'}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {SCENE_LABELS[item.scene]}
                        </Badge>
                      </div>

                      <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>版本数</span>
                          <span className="font-medium text-slate-900">{item.versionCount}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>当前发布</span>
                          <span className="font-medium text-slate-900">
                            {item.activeVersion ? `V${item.activeVersion.version}` : '未发布'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-auto pt-4">
                        <Button asChild className="w-full">
                          <Link to={`/ai/prompts/${item.code}`}>进入详情</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </>
  );
}
