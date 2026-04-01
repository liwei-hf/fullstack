import { useEffect, useMemo, useState } from 'react';
import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseChunkStrategy,
  KnowledgeBaseDetail,
  KnowledgeBaseDocumentItem,
  KnowledgeBaseImportJobItem,
  KnowledgeBaseItem,
  UploadKnowledgeBaseDocumentRequest,
} from '@fullstack/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

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

const CHUNK_STRATEGY_OPTIONS: KnowledgeBaseChunkStrategy[] = ['fixed', 'paragraph', 'heading'];

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [selectedChunkStrategy, setSelectedChunkStrategy] =
    useState<KnowledgeBaseChunkStrategy>('fixed');

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

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

  const fetchDetailAndDocuments = async (knowledgeBaseId: string) => {
    try {
      const [knowledgeBaseDetail, documentItems] = await Promise.all([
        api.get<KnowledgeBaseDetail>(`/knowledge-base/${knowledgeBaseId}`),
        api.get<KnowledgeBaseDocumentItem[]>(`/knowledge-base/${knowledgeBaseId}/documents`),
      ]);
      setDetail(knowledgeBaseDetail);
      setDocuments(documentItems);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '获取知识库详情失败',
        variant: 'destructive',
      });
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

  const handleUpload = async () => {
    if (!selectedId) {
      toast({
        title: '请先选择知识库',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedFile) {
      toast({
        title: '请选择文件',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append(
        'chunkStrategy',
        (selectedChunkStrategy satisfies UploadKnowledgeBaseDocumentRequest['chunkStrategy']),
      );
      await api.upload(`/knowledge-base/${selectedId}/documents/upload`, formData);
      setSelectedFile(null);
      toast({ title: '文件已上传，后台正在处理中' });
      await fetchDetailAndDocuments(selectedId);
      await fetchKnowledgeBases(selectedId);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '上传文件失败',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleZipImport = async () => {
    if (!selectedId) {
      toast({
        title: '请先选择知识库',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedZipFile) {
      toast({
        title: '请选择 ZIP 文件',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedZipFile);
      formData.append('chunkStrategy', selectedChunkStrategy);
      await api.upload<KnowledgeBaseImportJobItem>(
        `/knowledge-base/${selectedId}/import-zip`,
        formData,
      );
      setSelectedZipFile(null);
      toast({ title: '压缩包已上传，后台正在批量解析' });
      await fetchDetailAndDocuments(selectedId);
      await fetchKnowledgeBases(selectedId);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '上传 ZIP 失败',
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
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>知识库列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, name: event.target.value }))
                }
                placeholder="新建知识库名称"
              />
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="知识库描述（可选）"
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button onClick={handleCreate} disabled={createLoading} className="w-full">
                {createLoading ? '创建中...' : '创建知识库'}
              </Button>
            </div>

            <div className="space-y-2">
              {loading && <p className="text-sm text-muted-foreground">加载中...</p>}
              {!loading && items.length === 0 && (
                <p className="text-sm text-muted-foreground">还没有知识库，先创建一个。</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === item.id
                      ? 'border-blue-500 bg-blue-50'
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
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{detail?.name || '请选择知识库'}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  {detail?.description || '当前页面只负责知识库和文档维护。'}
                </p>
              </div>
              {selectedId && (
                <Button variant="outline" onClick={handleDeleteKnowledgeBase}>
                  删除知识库
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">上传单个文档</p>
                  <input
                    type="file"
                    accept=".pdf,.md,.markdown,.txt,.docx"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-600"
                  />
                  <p className="text-xs text-muted-foreground">
                    仅支持 PDF / Markdown / TXT / DOCX，单文件不超过 20MB。
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">ZIP 批量导入</p>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(event) => setSelectedZipFile(event.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-600"
                  />
                  <p className="text-xs text-muted-foreground">
                    ZIP 内只会解析文档格式文件，并忽略明显噪音目录。
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium text-gray-700">切片方式</p>
                  <select
                    value={selectedChunkStrategy}
                    onChange={(event) =>
                      setSelectedChunkStrategy(event.target.value as KnowledgeBaseChunkStrategy)
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {CHUNK_STRATEGY_OPTIONS.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {CHUNK_STRATEGY_LABELS[strategy]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {selectedChunkStrategy === 'fixed' &&
                      '适合通用文档，按固定长度切片并保留重叠窗口。'}
                    {selectedChunkStrategy === 'paragraph' &&
                      '优先按自然段落切片，适合员工手册、制度说明等正文型文档。'}
                    {selectedChunkStrategy === 'heading' &&
                      '优先按标题和章节结构切片，适合 Markdown 或层级清晰的规范文档。'}
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <Button onClick={handleUpload} disabled={uploading || !selectedId}>
                  {uploading ? '处理中...' : '上传单个文档'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleZipImport}
                  disabled={uploading || !selectedId}
                >
                  {uploading ? '处理中...' : '导入 ZIP 文档包'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>文档列表</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedId ? (
                documents.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>文件名</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>切片方式</TableHead>
                        <TableHead>切片数</TableHead>
                        <TableHead>上传人</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((document) => (
                        <TableRow key={document.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium text-gray-900">{document.fileName}</p>
                              {document.failureReason && (
                                <p className="text-xs text-red-500">{document.failureReason}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={document.status === 'READY' ? 'default' : 'outline'}>
                              {STATUS_LABELS[document.status] || document.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{CHUNK_STRATEGY_LABELS[document.chunkStrategy]}</TableCell>
                          <TableCell>{document.chunkCount}</TableCell>
                          <TableCell>{document.uploadedBy.username}</TableCell>
                          <TableCell>
                            <Button variant="ghost" onClick={() => handleDeleteDocument(document.id)}>
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">当前知识库还没有文档。</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">请先从左侧选择知识库。</p>
              )}
            </CardContent>
          </Card>

          {selectedItem && (
            <Card>
              <CardHeader>
                <CardTitle>使用说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>当前页面只负责知识库和文档维护。</p>
                <p>如果要基于当前知识库提问，请进入左侧导航里的“知识库问答”。</p>
                <p>如果要直接查业务数据，请进入左侧导航里的“智能问数”。</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Toaster />
    </>
  );
}
