import { useEffect, useMemo, useState } from 'react';
import type { AiLogItem, AiLogType } from '@fullstack/shared';
import { AI_LOG_TYPES } from '@fullstack/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { renderMarkdown } from '@/utils/markdown';

const TYPE_LABELS: Record<AiLogType, string> = {
  sql_query: '智能问数',
  knowledge_base: '知识库问答',
};

/**
 * AI 问答日志页
 *
 * 这里统一展示当前登录用户的问答历史，
 * 并按“智能问数 / 知识库问答”两类切换查看。
 */
export default function AiLogPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AiLogItem[]>([]);
  const [type, setType] = useState<AiLogType>('sql_query');
  const [loading, setLoading] = useState(false);

  const filteredItems = useMemo(
    () => items.filter((item) => item.type === type),
    [items, type],
  );

  const fetchLogs = async (nextType: AiLogType) => {
    setLoading(true);
    try {
      const response = await api.get<AiLogItem[]>(`/ai/logs?type=${nextType}`);
      setItems(response);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '获取问答日志失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(type);
  }, [type]);

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>问答日志</CardTitle>
            <p className="text-sm text-muted-foreground">
              这里展示当前登录账号的 AI 问答历史，并按类型分开查看。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {AI_LOG_TYPES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={type === item ? 'default' : 'outline'}
                  onClick={() => setType(item)}
                >
                  {TYPE_LABELS[item]}
                </Button>
              ))}
            </div>

            {loading && <p className="text-sm text-muted-foreground">加载中...</p>}
            {!loading && filteredItems.length === 0 && (
              <p className="text-sm text-muted-foreground">当前类型还没有问答记录。</p>
            )}

            <div className="space-y-4">
              {filteredItems.map((item) => (
                <Card key={item.id} className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{TYPE_LABELS[item.type]}</Badge>
                        <Badge variant={item.success ? 'default' : 'destructive'}>
                          {item.success ? '成功' : '失败'}
                        </Badge>
                        {item.knowledgeBase && (
                          <Badge variant="secondary">{item.knowledgeBase.name}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{item.createdAt}</p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        问题
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-900">{item.question}</p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        回答
                      </p>
                      {item.answer ? (
                        <div
                          className="markdown-body mt-2 rounded-2xl border bg-slate-50 p-4 text-sm leading-7 text-slate-900"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(item.answer) }}
                        />
                      ) : (
                        <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                          {item.errorMessage || '本次记录没有返回回答内容。'}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      {item.durationMs !== null && <span>耗时：{item.durationMs}ms</span>}
                      {item.rowCount !== null && <span>结果行数：{item.rowCount}</span>}
                      {item.sourceCount !== null && <span>命中片段：{item.sourceCount}</span>}
                      {item.requestId && <span>requestId：{item.requestId}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
      <style>{`
        .markdown-body p { margin: 0 0 10px; }
        .markdown-body ul, .markdown-body ol { margin: 0 0 10px 20px; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { margin: 0 0 10px; font-weight: 700; }
        .markdown-body blockquote { margin: 0 0 10px; padding-left: 12px; border-left: 3px solid #CBD5E1; color: #475569; }
        .markdown-body code { padding: 2px 6px; border-radius: 6px; background: #E2E8F0; font-size: 0.92em; }
        .markdown-body pre { overflow-x: auto; margin: 0 0 10px; border-radius: 12px; background: #0F172A; padding: 14px; color: #E2E8F0; }
        .markdown-body pre code { background: transparent; padding: 0; color: inherit; }
        .markdown-body a { color: #0F766E; text-decoration: underline; }
      `}</style>
    </>
  );
}
