import { useEffect, useMemo, useState } from 'react';
import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseChunkStrategy,
  KnowledgeBaseDetail,
  KnowledgeBaseDocumentItem,
  KnowledgeBaseImportJobItem,
  KnowledgeBaseItem,
  UploadKnowledgeBaseDocumentRequest,
  UpdateKnowledgeBaseRequest,
} from '@fullstack/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { ExpandablePanel } from '@/components/expandable-panel';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Upload, Trash2 } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: '待处理',
  PROCESSING: '处理中',
  READY: '可用',
  FAILED: '失败',
  DELETING: '删除中',
  DELETE_FAILED: '删除失败',
};

const CHUNK_STRATEGY_LABELS: Record<KnowledgeBaseChunkStrategy, string> = {
  fixed: '固定长度',
  paragraph: '段落优先',
  heading: '标题结构',
};

const CHUNK_STRATEGY_OPTIONS: KnowledgeBaseChunkStrategy[] = ['fixed', 'heading'];
const DOCUMENT_PAGE_SIZE = 10;

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

/**
 * 知识库管理页
 *
 * 这个页面只负责知识库和文档维护，不承载问答能力，
 * 让“知识库管理”和“知识库问答”在后台中职责分离、入口分离。
 */
export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [documents, setDocuments] = useState<KnowledgeBaseDocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [createForm, setCreateForm] = useState<CreateKnowledgeBaseRequest>({
    name: '',
    description: '',
  });
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedChunkStrategy, setSelectedChunkStrategy] =
    useState<KnowledgeBaseChunkStrategy>('fixed');
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [promptConfigExpanded, setPromptConfigExpanded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configForm, setConfigForm] = useState({
    systemPromptOverride: '',
  });
  const [documentPage, setDocumentPage] = useState(1);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [item.name, item.description || ''].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, searchKeyword]);

  const fetchKnowledgeBases = async (preferredId?: string, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
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
      if (!options?.silent) {
        toast({
          title: error instanceof Error ? error.message : '获取知识库失败',
          variant: 'destructive',
        });
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const fetchDetailAndDocuments = async (
    knowledgeBaseId: string,
    options?: { silent?: boolean },
  ) => {
    try {
      const [knowledgeBaseDetail, documentItems] = await Promise.all([
        api.get<KnowledgeBaseDetail>(`/knowledge-base/${knowledgeBaseId}`),
        api.get<KnowledgeBaseDocumentItem[]>(`/knowledge-base/${knowledgeBaseId}/documents`),
      ]);
      setDetail(knowledgeBaseDetail);
      setDocuments(documentItems);
    } catch (error) {
      if (!options?.silent) {
        toast({
          title: error instanceof Error ? error.message : '获取知识库详情失败',
          variant: 'destructive',
        });
      }
    }
  };

  useEffect(() => {
    void fetchKnowledgeBases();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDocuments([]);
      return;
    }

    void fetchDetailAndDocuments(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setConfigForm({
      systemPromptOverride: detail.promptConfig.systemPromptOverride || '',
    });
  }, [detail]);

  useEffect(() => {
    setDocumentPage(1);
  }, [selectedId, documents.length]);

  const hasActiveDocuments = useMemo(
    () =>
      documents.some((document) =>
        ['UPLOADED', 'PROCESSING', 'DELETING'].includes(document.status),
      ),
    [documents],
  );

  const totalDocumentPages = Math.max(1, Math.ceil(documents.length / DOCUMENT_PAGE_SIZE));
  const currentDocumentPage = Math.min(documentPage, totalDocumentPages);
  const pagedDocuments = documents.slice(
    (currentDocumentPage - 1) * DOCUMENT_PAGE_SIZE,
    currentDocumentPage * DOCUMENT_PAGE_SIZE,
  );
  const documentPageItems = buildPageItems(currentDocumentPage, totalDocumentPages);

  useEffect(() => {
    if (!selectedId || !hasActiveDocuments) {
      setIsAutoRefreshing(false);
      return;
    }

    setIsAutoRefreshing(true);
    const timer = window.setInterval(() => {
      void fetchDetailAndDocuments(selectedId, { silent: true });
    }, 5000);

    return () => {
      window.clearInterval(timer);
      setIsAutoRefreshing(false);
    };
  }, [selectedId, hasActiveDocuments]);

  const handleCreate = async () => {
    if (!createForm.name?.trim()) {
      toast({
        title: '知识库名称不能为空',
        variant: 'destructive',
      });
      return;
    }

    setCreateLoading(true);
    try {
      const created = await api.post<KnowledgeBaseDetail>('/knowledge-base', {
        name: createForm.name.trim(),
        description: createForm.description?.trim() || undefined,
      });
      setCreateForm({ name: '', description: '' });
      setCreateDialogOpen(false);
      toast({ title: '知识库已创建' });
      await fetchKnowledgeBases(created.id);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '创建知识库失败',
        variant: 'destructive',
      });
    } finally {
      setCreateLoading(false);
    }
  };

  /**
   * 上传入口统一为一个文件选择器
   *
   * 通过扩展名自动分流：
   * - zip 走批量导入
   * - 其它白名单格式走单文件上传
   */
  const handleUpload = async () => {
    if (!selectedId) {
      toast({
        title: '请先选择知识库',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedUploadFile) {
      toast({
        title: '请选择文件',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedUploadFile);
      formData.append(
        'chunkStrategy',
        (selectedChunkStrategy satisfies UploadKnowledgeBaseDocumentRequest['chunkStrategy']),
      );
      const isZipFile = selectedUploadFile.name.toLowerCase().endsWith('.zip');
      if (isZipFile) {
        await api.upload<KnowledgeBaseImportJobItem>(
          `/knowledge-base/${selectedId}/import-zip`,
          formData,
        );
        toast({ title: '压缩包已上传，后台正在批量解析' });
      } else {
        await api.upload(`/knowledge-base/${selectedId}/documents/upload`, formData);
        toast({ title: '文件已上传，后台正在处理中' });
      }
      setSelectedUploadFile(null);
      setUploadDialogOpen(false);
      await fetchDetailAndDocuments(selectedId);
      await fetchKnowledgeBases(selectedId, { silent: true });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '上传文件失败',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('确定要删除这个文档吗？删除后将不再参与检索。')) {
      return;
    }

    try {
      await api.delete(`/knowledge-base/documents/${documentId}`);
      toast({ title: '文档删除已受理' });
      if (selectedId) {
        await fetchDetailAndDocuments(selectedId);
        await fetchKnowledgeBases(selectedId);
      }
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '删除文档失败',
        variant: 'destructive',
      });
    }
  };

  const handleSavePromptConfig = async () => {
    if (!selectedId) {
      return;
    }

    setConfigSaving(true);
    try {
      const updated = await api.patch<KnowledgeBaseDetail>(`/knowledge-base/${selectedId}`, {
        systemPromptOverride: configForm.systemPromptOverride,
      } satisfies UpdateKnowledgeBaseRequest);
      setDetail(updated);
      toast({ title: '知识库问答配置已保存' });
      await fetchKnowledgeBases(selectedId, { silent: true });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '保存知识库问答配置失败',
        variant: 'destructive',
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleDeleteKnowledgeBase = async () => {
    if (!selectedId) {
      return;
    }

    if (!confirm('确定要删除当前知识库吗？只有空知识库才能删除，相关问答日志也会一并清理。')) {
      return;
    }

    try {
      await api.delete(`/knowledge-base/${selectedId}`);
      toast({ title: '知识库已删除' });
      setSelectedId('');
      await fetchKnowledgeBases();
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '删除知识库失败',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="知识库管理"
          description="左侧管理知识库列表，右侧维护基础信息、补充提示词和文档表格。上传入口统一支持普通文件与 ZIP 自动分流。"
        />

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <div className="border-b border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchKeyword}
                      onChange={(event) => setSearchKeyword(event.target.value)}
                      placeholder="搜索知识库..."
                      className="h-11 rounded-xl border-slate-200 pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => setCreateDialogOpen(true)}
                    className="h-11 rounded-xl bg-blue-600 px-4 hover:bg-blue-700"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    新建知识库
                  </Button>
                </div>
              </div>

              <div className="bg-white">
                {loading && <p className="px-5 py-6 text-sm text-muted-foreground">加载中...</p>}
                {!loading && filteredItems.length === 0 && (
                  <p className="px-5 py-6 text-sm text-muted-foreground">
                    {searchKeyword ? '没有匹配的知识库。' : '还没有知识库，先创建一个。'}
                  </p>
                )}
                {!loading &&
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`group relative flex w-full items-center justify-between border-b border-slate-100 px-5 py-5 text-left transition last:border-b-0 ${
                        selectedId === item.id ? 'bg-blue-50/80' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`absolute inset-y-3 left-0 w-1 rounded-full ${
                          selectedId === item.id ? 'bg-blue-500' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 pr-4">
                        <p className="truncate text-base font-medium text-slate-900">{item.name}</p>
                        {item.description ? (
                          <p className="mt-1 truncate text-sm text-slate-500">{item.description}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className="shrink-0 border-slate-200 text-slate-600">
                        {item.readyDocumentCount}/{item.documentCount}
                      </Badge>
                    </button>
                  ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="space-y-8 p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
                      {detail?.name || '请选择知识库'}
                    </h2>
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <p className="text-base leading-7 text-slate-600">
                        {detail?.description || '当前页面只负责知识库和文档维护。'}
                      </p>
                    </div>
                  </div>
                  {selectedId && (detail?.documentCount ?? 0) === 0 ? (
                    <Button variant="outline" onClick={handleDeleteKnowledgeBase} className="rounded-xl">
                      删除知识库
                    </Button>
                  ) : null}
                </div>

                <section className="border-t border-slate-200 pt-8">
                  <ExpandablePanel
                    title="提示词"
                    description="默认折叠，展开后可以补充当前知识库的专属问答规则。"
                    expanded={promptConfigExpanded}
                    onToggle={() => setPromptConfigExpanded((previous) => !previous)}
                    className="border-slate-200"
                    contentClassName="bg-slate-50/60"
                  >
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-700">补充提示词</p>
                        <Textarea
                          value={configForm.systemPromptOverride}
                          onChange={(event) =>
                            setConfigForm((previous) => ({
                              ...previous,
                              systemPromptOverride: event.target.value,
                            }))
                          }
                          disabled={!selectedId}
                          placeholder="请设定与当前知识库相关的补充提示词..."
                          className="min-h-[140px] rounded-xl border-slate-200 bg-white px-4 py-3 text-sm focus-visible:ring-blue-200"
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={handleSavePromptConfig}
                          disabled={!selectedId || configSaving}
                          className="rounded-xl bg-blue-600 px-5 hover:bg-blue-700"
                        >
                          {configSaving ? '保存中...' : '保存配置'}
                        </Button>
                      </div>
                    </div>
                  </ExpandablePanel>
                </section>

                <section className="space-y-4 border-t border-slate-200 pt-8">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900">知识库文档列表</h3>
                      {isAutoRefreshing ? (
                        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                          正在自动刷新处理状态
                        </p>
                      ) : null}
                    </div>
                    <Button
                      onClick={() => setUploadDialogOpen(true)}
                      disabled={!selectedId}
                      className="rounded-xl bg-blue-600 px-4 hover:bg-blue-700"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      上传文档
                    </Button>
                  </div>

                  {selectedId ? (
                    documents.length > 0 ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead>文件名</TableHead>
                              <TableHead>状态</TableHead>
                              <TableHead>切片方式</TableHead>
                              <TableHead>切片数</TableHead>
                              <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedDocuments.map((document) => (
                              <TableRow key={document.id}>
                                <TableCell>
                                  <div className="space-y-1">
                                    <p className="font-medium text-slate-900">{document.fileName}</p>
                                    {document.failureReason ? (
                                      <p className="text-xs text-rose-500">{document.failureReason}</p>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={document.status === 'READY' ? 'default' : 'outline'}
                                    className={
                                      document.status === 'PROCESSING' || document.status === 'UPLOADED'
                                        ? 'gap-1 border-amber-200 bg-amber-50 text-amber-700'
                                        : document.status === 'READY'
                                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                                          : undefined
                                    }
                                  >
                                    {(document.status === 'PROCESSING' ||
                                      document.status === 'UPLOADED') && (
                                      <span className="inline-block h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
                                    )}
                                    {STATUS_LABELS[document.status] || document.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{CHUNK_STRATEGY_LABELS[document.chunkStrategy]}</TableCell>
                                <TableCell>{document.chunkCount}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    onClick={() => handleDeleteDocument(document.id)}
                                    className="gap-1 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    删除
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-slate-500">
                            共 {documents.length} 份文档，第 {currentDocumentPage}/{totalDocumentPages} 页
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              className="rounded-xl"
                              disabled={currentDocumentPage <= 1}
                              onClick={() =>
                                setDocumentPage((previous) => Math.max(1, previous - 1))
                              }
                            >
                              上一页
                            </Button>
                            <div className="flex items-center gap-2">
                              {documentPageItems.map((item) =>
                                typeof item === 'number' ? (
                                  <Button
                                    key={item}
                                    variant={item === currentDocumentPage ? 'default' : 'outline'}
                                    className={`min-w-10 rounded-xl px-0 ${
                                      item === currentDocumentPage
                                        ? 'bg-blue-600 hover:bg-blue-700'
                                        : ''
                                    }`}
                                    onClick={() => setDocumentPage(item)}
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
                              disabled={currentDocumentPage >= totalDocumentPages}
                              onClick={() =>
                                setDocumentPage((previous) =>
                                  Math.min(totalDocumentPages, previous + 1),
                                )
                              }
                            >
                              下一页
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm text-slate-500">
                        当前知识库还没有文档，点击右上角“上传文档”开始导入。
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm text-slate-500">
                      请先从左侧选择知识库。
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-xl rounded-2xl border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>新建知识库</DialogTitle>
            <DialogDescription>填写知识库名称和说明，创建后会自动选中它。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">知识库名称</p>
              <Input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, name: event.target.value }))
                }
                placeholder="例如：产品FAQ知识库"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">知识库描述</p>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="可选，描述知识库主要内容和用途。"
                className="min-h-[120px] rounded-xl border-slate-200 bg-white px-4 py-3 text-sm focus-visible:ring-blue-200"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="rounded-xl">
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createLoading} className="rounded-xl bg-blue-600 hover:bg-blue-700">
              {createLoading ? '创建中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-xl rounded-2xl border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <DialogTitle>上传文档</DialogTitle>
            <DialogDescription>
              支持单文件和 ZIP 文档包，系统会自动根据扩展名分流。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">选择文件</p>
              <input
                type="file"
                accept=".pdf,.md,.markdown,.txt,.docx,.zip"
                onChange={(event) => setSelectedUploadFile(event.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-600"
              />
              <p className="text-xs text-slate-500">
                支持 PDF / Markdown / TXT / DOCX / ZIP，ZIP 内会自动按规则批量导入。
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">切片方式</p>
              <Select
                value={selectedChunkStrategy}
                onValueChange={(value) => setSelectedChunkStrategy(value as KnowledgeBaseChunkStrategy)}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white text-sm shadow-none focus:ring-blue-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200">
                  {CHUNK_STRATEGY_OPTIONS.map((strategy) => (
                    <SelectItem key={strategy} value={strategy}>
                      {CHUNK_STRATEGY_LABELS[strategy]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {selectedChunkStrategy === 'fixed'
                  ? '适合通用文档，按固定长度切片并保留重叠窗口。'
                  : '优先按标题和章节结构切片，适合 Markdown 或层级清晰的规范文档。'}
              </p>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)} className="rounded-xl">
              取消
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedId}
              className="rounded-xl bg-blue-600 hover:bg-blue-700"
            >
              {uploading ? '处理中...' : '开始上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster />
    </>
  );
}
