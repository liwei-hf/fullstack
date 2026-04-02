import { useEffect, useMemo, useState } from 'react';
import type { AiLogDetailItem, AiLogItem, AiLogType } from '@fullstack/shared';
import { AI_LOG_TYPES } from '@fullstack/shared';
import { CalendarRange, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toaster } from '@/components/ui/toaster';
import { ExpandablePanel } from '@/components/expandable-panel';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { renderMarkdown } from '@/utils/markdown';

const TYPE_LABELS: Record<AiLogType, string> = {
  sql_query: '智能问数',
  knowledge_base: '知识库问答',
};

const LOG_PAGE_SIZE = 10;

function buildPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis-end', totalPages] as const;
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis-start',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ] as const;
  }

  return [
    1,
    'ellipsis-start',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-end',
    totalPages,
  ] as const;
}

export default function AiLogPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AiLogItem[]>([]);
  const [type, setType] = useState<AiLogType | 'all'>('all');
  const [requestIdKeyword, setRequestIdKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AiLogDetailItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const [sqlExpanded, setSqlExpanded] = useState(true);
  const [page, setPage] = useState(1);

  const fetchLogs = async (nextType: AiLogType | 'all') => {
    setLoading(true);
    try {
      const suffix = nextType === 'all' ? '' : `?type=${nextType}`;
      const response = await api.get<AiLogItem[]>(`/ai/logs${suffix}`);
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

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (requestIdKeyword && !item.requestId?.toLowerCase().includes(requestIdKeyword.toLowerCase())) {
        return false;
      }

      const createdAt = new Date(item.createdAt);
      if (dateFrom) {
        const start = new Date(`${dateFrom}T00:00:00`);
        if (createdAt < start) {
          return false;
        }
      }

      if (dateTo) {
        const end = new Date(`${dateTo}T23:59:59`);
        if (createdAt > end) {
          return false;
        }
      }

      return true;
    });
  }, [dateFrom, dateTo, items, requestIdKeyword]);

  useEffect(() => {
    setPage(1);
  }, [type, dateFrom, dateTo, requestIdKeyword, items.length]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / LOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice(
    (currentPage - 1) * LOG_PAGE_SIZE,
    currentPage * LOG_PAGE_SIZE,
  );
  const pageItems = buildPageItems(currentPage, totalPages);

  const handleOpenDetail = async (item: AiLogItem) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setThinkingExpanded(true);
    setSqlExpanded(true);

    try {
      const response = await api.get<AiLogDetailItem>(`/ai/logs/${item.type}/${item.id}`);
      setDetail(response);
    } catch (error) {
      setDetail(null);
      toast({
        title: error instanceof Error ? error.message : '获取问答日志详情失败',
        variant: 'destructive',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="问答日志"
          description="统一查看智能问数与知识库问答的请求记录，支持按类型、日期和 requestId 快速检索，并进入详情查看 SQL 或 think。"
        />

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <div className="grid gap-3 xl:grid-cols-[160px_180px_180px_1fr_auto]">
            <Select value={type} onValueChange={(value) => setType(value as AiLogType | 'all')}>
              <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 px-4 text-sm shadow-none focus:ring-blue-200">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-200">
                <SelectItem value="all">全部类型</SelectItem>
                {AI_LOG_TYPES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {TYPE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 pl-10"
              />
            </div>

            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 pl-10"
              />
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={requestIdKeyword}
                onChange={(event) => setRequestIdKeyword(event.target.value)}
                placeholder="搜索 requestId..."
                className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 pl-10"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={() => {
                setType('all');
                setRequestIdKeyword('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              重置
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>问题</TableHead>
                <TableHead>回答摘要</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>requestId</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-sm text-slate-500">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-40 text-center text-sm text-slate-500">
                    当前筛选条件下没有问答日志。
                  </TableCell>
                </TableRow>
              ) : (
                pagedItems.map((item) => (
                  <TableRow key={item.id} className="h-16">
                    <TableCell className="text-sm text-slate-500">
                      {new Date(item.createdAt).toLocaleString('zh-CN')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{TYPE_LABELS[item.type]}</Badge>
                        <Badge variant={item.success ? 'default' : 'destructive'}>
                          {item.success ? '成功' : '失败'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="truncate text-sm font-medium text-slate-900">{item.question}</p>
                    </TableCell>
                    <TableCell className="max-w-[340px]">
                      <p className="line-clamp-2 text-sm leading-6 text-slate-500">
                        {item.answer || item.errorMessage || '无返回内容'}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {item.durationMs !== null ? `${item.durationMs}ms` : '--'}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <p className="truncate text-xs text-slate-500">{item.requestId || '--'}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" className="rounded-2xl" onClick={() => void handleOpenDetail(item)}>
                        查看详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {!loading && filteredItems.length > 0 ? (
            <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                共 {filteredItems.length} 条日志，第 {currentPage}/{totalPages} 页
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                >
                  上一页
                </Button>
                <div className="flex items-center gap-2">
                  {pageItems.map((item) =>
                    typeof item === 'number' ? (
                      <Button
                        key={item}
                        variant={item === currentPage ? 'default' : 'outline'}
                        className={`min-w-10 rounded-xl px-0 ${
                          item === currentPage
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : ''
                        }`}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </Button>
                    ) : (
                      <span key={item} className="px-1 text-sm text-slate-400">
                        ...
                      </span>
                    ),
                  )}
                </div>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="left-auto right-0 top-0 h-screen max-w-[480px] translate-x-0 translate-y-0 rounded-none border-l border-slate-200/80 bg-white p-0 shadow-[0_24px_60px_rgba(15,23,42,0.12)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right-full">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-slate-100 px-6 py-5 text-left">
              <DialogTitle>日志详情</DialogTitle>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {detailLoading ? (
                <p className="text-sm text-slate-500">详情加载中...</p>
              ) : detail ? (
                <>
                  <section className="space-y-3 rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{TYPE_LABELS[detail.type]}</Badge>
                      <Badge variant={detail.success ? 'default' : 'destructive'}>
                        {detail.success ? '成功' : '失败'}
                      </Badge>
                      {detail.knowledgeBase ? <Badge variant="secondary">{detail.knowledgeBase.name}</Badge> : null}
                    </div>
                    <div className="grid gap-3 text-sm text-slate-500">
                      <p>时间：{new Date(detail.createdAt).toLocaleString('zh-CN')}</p>
                      <p>requestId：{detail.requestId || '--'}</p>
                      <p>耗时：{detail.durationMs !== null ? `${detail.durationMs}ms` : '--'}</p>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">问题</p>
                    <div className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                      {detail.question}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">回答</p>
                    {detail.answer ? (
                      <div
                        className="markdown-body rounded-[20px] border border-slate-200/80 bg-white px-4 py-4 text-sm leading-7 text-slate-700"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(detail.answer) }}
                      />
                    ) : (
                      <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-600">
                        {detail.errorMessage || '本次请求没有生成回答内容。'}
                      </div>
                    )}
                  </section>

                  {detail.thinking ? (
                    <ExpandablePanel
                      title="Think"
                      description="记录模型流式返回的思考内容。"
                      expanded={thinkingExpanded}
                      onToggle={() => setThinkingExpanded((current) => !current)}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                        {detail.thinking}
                      </div>
                    </ExpandablePanel>
                  ) : null}

                  {detail.sql ? (
                    <ExpandablePanel
                      title="SQL"
                      description="智能问数生成并执行的 SQL 语句。"
                      expanded={sqlExpanded}
                      onToggle={() => setSqlExpanded((current) => !current)}
                    >
                      <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                        {detail.sql}
                      </pre>
                    </ExpandablePanel>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">当前没有可展示的详情。</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster />
      <style>{`
        .markdown-body p { margin: 0 0 12px; }
        .markdown-body ul, .markdown-body ol { margin: 0 0 12px 20px; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { margin: 0 0 12px; font-weight: 700; }
        .markdown-body blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid #CBD5E1; color: #475569; }
        .markdown-body code { padding: 2px 6px; border-radius: 6px; background: #E2E8F0; font-size: 0.92em; }
        .markdown-body pre { overflow-x: auto; margin: 0 0 12px; border-radius: 14px; background: #0F172A; padding: 14px; color: #E2E8F0; }
        .markdown-body pre code { background: transparent; padding: 0; color: inherit; }
      `}</style>
    </>
  );
}
