import { useMemo, useState } from 'react';
import type { AiSqlSseEvent } from '@fullstack/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import { renderMarkdown } from '@/utils/markdown';
import { useToast } from '@/hooks/use-toast';

const EXAMPLES = [
  '今天完成了哪些待办？',
  '当前共有多少个用户？',
  '各部门有多少人？',
  '我的待办里还有多少进行中的任务？',
];

/**
 * 智能问数页
 *
 * 这个页面只负责“自然语言 -> SQL -> 查询结果 -> 自然语言答案”链路，
 * 和知识库问答彻底分开，避免后台 AI 入口语义混在一起。
 */
export default function SqlQueryPage() {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const renderedAnswer = useMemo(() => renderMarkdown(answer), [answer]);

  const handleAsk = async () => {
    if (!question.trim()) {
      toast({
        title: '请输入问题',
        variant: 'destructive',
      });
      return;
    }

    setAnswer('');
    setAsking(true);

    try {
      await api.streamSse<AiSqlSseEvent>('/ai/sql/stream', { question: question.trim() }, (event) => {
        if (event.type === 'answer_delta') {
          setAnswer((previous) => previous + event.delta);
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.message);
        }
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '智能问数失败',
        variant: 'destructive',
      });
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>智能问数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuestion(example)}
                  className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-200"
                >
                  {example}
                </button>
              ))}
            </div>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：今天完成了哪些待办？"
              className="min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
            />

            <Button onClick={handleAsk} disabled={asking} className="w-full">
              {asking ? '正在分析...' : '开始查询'}
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
                className="markdown-body min-h-[360px] rounded-2xl border bg-slate-50 p-6 text-[15px] leading-8 text-slate-900"
                dangerouslySetInnerHTML={{ __html: renderedAnswer }}
              />
            ) : (
              <div className="min-h-[360px] rounded-2xl border bg-slate-50 p-6 text-[15px] leading-8 text-slate-500">
                输入问题后，这里会展示自然语言答案。
              </div>
            )}
          </CardContent>
        </Card>
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
