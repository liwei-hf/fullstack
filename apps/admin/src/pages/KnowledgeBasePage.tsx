import { useEffect, useMemo, useState } from 'react';
import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseDetail,
  KnowledgeBaseDocumentItem,
  KnowledgeBaseItem,
  RagSseEvent,
  RagSourceItem,
} from '@fullstack/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: '待处理',
  PROCESSING: '处理中',
  READY: '可用',
  FAILED: '失败',
  DELETING: '删除中',
  DELETE_FAILED: '删除失败',
};

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [documents, setDocuments] = useState<KnowledgeBaseDocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [createForm, setCreateForm] = useState<CreateKnowledgeBaseRequest>({
    name: '',
    description: '',
  });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<RagSourceItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
        preferredId ||
        selectedId ||
        response[0]?.id ||
        '';
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

    if (!confirm('确定要删除当前知识库吗？只有空知识库才能删除。')) {
      return;
    }

    try {
      await api.delete(`/knowledge-base/${selectedId}`);
      toast({ title: '知识库已删除' });
      setAnswer('');
      setSources([]);
      setQuestion('');
      setSelectedId('');
      await fetchKnowledgeBases();
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '删除知识库失败',
        variant: 'destructive',
      });
    }
  };

  const handleAsk = async () => {
    if (!selectedId) {
      toast({
        title: '请先选择知识库',
        variant: 'destructive',
      });
      return;
    }

    if (!question.trim()) {
      toast({
        title: '请输入问题',
        variant: 'destructive',
      });
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
            <CardTitle>知识库</CardTitle>
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
                      <p className="mt-1 text-sm text-gray-500">
                        {item.description || '暂无描述'}
                      </p>
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
                  {detail?.description || '当前知识库用于管理文档与智能问答。'}
                </p>
              </div>
              {selectedId && (
                <Button variant="outline" onClick={handleDeleteKnowledgeBase}>
                  删除知识库
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">上传文档</p>
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
              <Button onClick={handleUpload} disabled={uploading || !selectedId}>
                {uploading ? '上传中...' : '上传到当前知识库'}
              </Button>
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
                          <TableCell>{document.chunkCount}</TableCell>
                          <TableCell>{document.uploadedBy.username}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              onClick={() => handleDeleteDocument(document.id)}
                            >
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

          <Card>
            <CardHeader>
              <CardTitle>知识库问答</CardTitle>
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

              <div className="rounded-2xl border bg-slate-50 p-5">
                <p className="mb-3 text-sm font-medium text-slate-700">回答结果</p>
                <div className="min-h-[180px] whitespace-pre-wrap text-[15px] leading-7 text-slate-900">
                  {answer || '这里会展示流式回答。'}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5">
                <p className="mb-3 text-sm font-medium text-slate-700">引用来源</p>
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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Toaster />
    </>
  );
}
