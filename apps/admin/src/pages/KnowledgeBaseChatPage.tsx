import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeBaseDetail, KnowledgeBaseItem, RagSseEvent, RagSourceItem } from '@fullstack/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import { renderMarkdown } from '@/utils/markdown';
import { useToast } from '@/hooks/use-toast';

/**
 * 知识库问答页
 *
 * 这个页面只承载“选知识库 -> 提问 -> 看答案与来源”，
 * 不再混入文档上传和知识库维护逻辑。
 */
export default function KnowledgeBaseChatPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<RagSourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const renderedAnswer = useMemo(() => renderMarkdown(answer), [answer]);

  const fetchKnowledgeBases = async (preferredId?: string) => {
    setLoading(true);
    try {
      const response = await api.get<KnowledgeBaseItem[]>('/knowledge-base');
      setItems(response);
      const nextSelectedId =
        preferredId !== undefined
          ? preferredId || response[0]?.id || ''
          : response.some((item) => item.id === selectedId)
            ? selectedId
            : response[0]?.id || '';
      setSelectedId(nextSelectedId);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '获取知识库失败',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchKnowledgeBases();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    void api
      .get<KnowledgeBaseDetail>(`/knowledge-base/${selectedId}`)
      .then(setDetail)
      .catch((error) => {
        toast({
          title: error instanceof Error ? error.message : '获取知识库详情失败',
          variant: 'destructive',
        });
      });
  }, [selectedId, toast]);

  const handleAsk = async () => {
    if (!selectedId) {
      toast({ title: '请先选择知识库', variant: 'destructive' });
      return;
    }

    if (!question.trim()) {
      toast({ title: '请输入问题', variant: 'destructive' });
      return;
    }

    setAnswer('');
    setSources([]);
    setAsking(true);

    try {
      await api.streamSse<RagSseEvent>(
        `/knowledge-base/${selectedId}/chat/stream`,
        { question: question.trim() },
        (event) => {
          if (event.type === 'answer_delta') {
            setAnswer((previous) => previous + event.delta);
            return;
          }

          if (event.type === 'sources') {
            setSources(event.items);
            return;
          }

          if (event.type === 'error') {
            throw new Error(event.message);
          }
        },
      );
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '知识库问答失败',
        variant: 'destructive',
      });
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>选择知识库</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">加载中...</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">还没有知识库，先去“知识库管理”创建。</p>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedId === item.id
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="mt-1 text-sm text-gray-500">{item.description || '暂无描述'}</p>
                  </div>
                  <Badge variant="outline">
                    {item.readyDocumentCount}/{item.documentCount}
                  </Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{detail?.name || '请选择知识库'}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {detail?.description || '当前页面只负责基于知识库内容进行问答。'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  selectedItem
                    ? `向“${selectedItem.name}”提问，例如：这个文档主要讲了什么？`
                    : '请先选择知识库，再开始提问'
                }
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
              />
              <Button onClick={handleAsk} disabled={asking || !selectedId}>
                {asking ? '回答生成中...' : '开始问答'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>回答结果</CardTitle>
            </CardHeader>
            <CardContent>
              {answer ? (
                <div
                  className="markdown-body min-h-[220px] rounded-2xl border bg-slate-50 p-5 text-[15px] leading-7 text-slate-900"
                  dangerouslySetInnerHTML={{ __html: renderedAnswer }}
                />
              ) : (
                <div className="min-h-[220px] rounded-2xl border bg-slate-50 p-5 text-[15px] leading-7 text-slate-500">
                  这里会展示知识库问答的流式回答。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>引用来源</CardTitle>
            </CardHeader>
            <CardContent>
              {sources.length > 0 ? (
                <div className="space-y-3">
                  {sources.map((source) => (
                    <div key={source.chunkId} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-medium text-slate-900">{source.documentName}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{source.snippet}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">命中的文档片段会显示在这里。</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Toaster />
      <style>{`
        .markdown-body p { margin: 0 0 12px; }
        .markdown-body ul, .markdown-body ol { margin: 0 0 12px 20px; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { margin: 0 0 12px; font-weight: 700; }
        .markdown-body blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid #CBD5E1; color: #475569; }
        .markdown-body code { padding: 2px 6px; border-radius: 6px; background: #E2E8F0; font-size: 0.92em; }
        .markdown-body pre { overflow-x: auto; margin: 0 0 12px; border-radius: 12px; background: #0F172A; padding: 16px; color: #E2E8F0; }
        .markdown-body pre code { background: transparent; padding: 0; color: inherit; }
        .markdown-body a { color: #0F766E; text-decoration: underline; }
      `}</style>
    </>
  );
}
