import { useEffect, useMemo, useState } from 'react';
import type {
  CreatePromptVersionRequest,
  PromptTemplateCode,
  PromptTemplateDetail,
  PromptTestLogItem,
  PromptTestRequest,
  PromptTestResult,
  PromptVersionItem,
  UpdatePromptVersionRequest,
} from '@fullstack/shared';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const TEMPLATE_TEST_EXAMPLES: Record<PromptTemplateCode, Record<string, unknown>> = {
  sql_generation: {
    question: '今天完成了哪些待办？',
    currentUserRules:
      '当前登录用户信息：\\n- 当前登录用户的真实 "User"."id" = \'cmn_demo_user\'',
    roleRules:
      '你是管理员查询 SQL 生成器。可以查询 "User"、"Department"、"Todo" 的全量数据。',
    sqlSchemaDescription:
      '表："User"、"Department"、"Todo"，字段名必须使用双引号，Todo.status 只允许 TODO / IN_PROGRESS / DONE。',
    sqlGenerationExamples:
      '问题：我在哪个部门\\nSQL：SELECT "Department"."name" FROM "User" INNER JOIN "Department" ON "User"."departmentId" = "Department"."id" WHERE "User"."id" = \'cmn_demo_user\' LIMIT 50',
  },
  sql_answer: {
    question: '今天完成了哪些待办？',
    role: 'admin',
    rowsJson:
      '[{"title":"研发部补充接口文档","status":"DONE","updatedAt":"2026-04-01T10:00:00.000Z"}]',
  },
  knowledge_base_answer: {
    question: '请用一句话总结员工手册的核心内容，并列出 3 个关键规定。',
    contextText:
      '片段 1：员工手册规定员工需遵守考勤制度，每日 9:00 前打卡。\\n\\n片段 2：请假需提前提交申请，病假需补充医院证明。\\n\\n片段 3：公司倡导信息安全，未经授权不得外发内部资料。',
  },
};

const STATUS_LABELS: Record<PromptVersionItem['status'], string> = {
  draft: '草稿',
  active: '已发布',
  archived: '已归档',
};

/**
 * Prompt 管理页
 *
 * 详情页只聚焦一个模板，把“版本管理”和“测试台”集中在一处，
 * 配合列表页形成更标准的后台管理路径。
 */
export default function PromptManagementPage() {
  const { toast } = useToast();
  const params = useParams<{ code: PromptTemplateCode }>();
  const selectedCode = params.code as PromptTemplateCode | undefined;
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [editor, setEditor] = useState<CreatePromptVersionRequest>({
    systemPrompt: '',
    userPromptTemplate: '',
    variablesSchema: {},
  });
  const [variablesSchemaText, setVariablesSchemaText] = useState('{}');
  const [variablesText, setVariablesText] = useState('{}');
  const [testLogs, setTestLogs] = useState<PromptTestLogItem[]>([]);
  const [testResult, setTestResult] = useState<PromptTestResult | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [testing, setTesting] = useState(false);

  if (!selectedCode || !(selectedCode in TEMPLATE_TEST_EXAMPLES)) {
    return <Navigate to="/ai/prompts" replace />;
  }

  const selectedVersion = useMemo(
    () => detail?.versions.find((item) => item.id === selectedVersionId) ?? null,
    [detail, selectedVersionId],
  );
  const filteredLogs = useMemo(
    () => testLogs.filter((item) => item.templateCode === selectedCode),
    [selectedCode, testLogs],
  );

  const syncEditorFromVersion = (version: PromptVersionItem | null, fallback?: PromptTemplateDetail | null) => {
    if (version) {
      setEditor({
        systemPrompt: version.systemPrompt,
        userPromptTemplate: version.userPromptTemplate,
        variablesSchema: version.variablesSchema ?? {},
      });
      setVariablesSchemaText(JSON.stringify(version.variablesSchema ?? {}, null, 2));
      setVariablesText(JSON.stringify(TEMPLATE_TEST_EXAMPLES[selectedCode], null, 2));
      return;
    }

    const target = fallback ?? detail;
    if (!target) {
      return;
    }

    setEditor({
      systemPrompt: target.defaultDraft.systemPrompt,
      userPromptTemplate: target.defaultDraft.userPromptTemplate,
      variablesSchema: target.defaultDraft.variablesSchema ?? {},
    });
    setVariablesSchemaText(JSON.stringify(target.defaultDraft.variablesSchema ?? {}, null, 2));
    setVariablesText(JSON.stringify(TEMPLATE_TEST_EXAMPLES[target.code], null, 2));
  };

  const fetchDetail = async (code: PromptTemplateCode) => {
    setLoadingDetail(true);
    try {
      const [detailResponse, logResponse] = await Promise.all([
        api.get<PromptTemplateDetail>(`/ai/prompts/templates/${code}`),
        api.get<PromptTestLogItem[]>('/ai/prompts/test-logs?limit=30'),
      ]);

      setDetail(detailResponse);
      setTestLogs(logResponse);
      const nextSelectedVersion =
        detailResponse.versions.find((item) => item.status === 'draft') ??
        detailResponse.versions.find((item) => item.status === 'active') ??
        null;
      setSelectedVersionId(nextSelectedVersion?.id ?? null);
      syncEditorFromVersion(nextSelectedVersion, detailResponse);
      setTestResult(null);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '获取 Prompt 详情失败',
        variant: 'destructive',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void fetchDetail(selectedCode);
  }, [selectedCode]);

  const handleCreateVersion = async () => {
    if (!detail) {
      return;
    }

    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(variablesSchemaText) as Record<string, unknown>;
    } catch {
      toast({
        title: '变量 Schema 不是合法 JSON',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const created = await api.post<PromptVersionItem>(
        `/ai/prompts/templates/${detail.code}/versions`,
        {
          ...editor,
          variablesSchema: parsedSchema,
        } satisfies CreatePromptVersionRequest,
      );
      toast({ title: `已创建 V${created.version} 草稿版本` });
      await fetchDetail(detail.code);
      setSelectedVersionId(created.id);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '创建 Prompt 版本失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateVersion = async () => {
    if (!selectedVersion || selectedVersion.status !== 'draft') {
      toast({
        title: '请选择草稿版本后再保存',
        variant: 'destructive',
      });
      return;
    }

    let parsedSchema: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(variablesSchemaText) as Record<string, unknown>;
    } catch {
      toast({
        title: '变量 Schema 不是合法 JSON',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await api.patch<PromptVersionItem>(`/ai/prompts/versions/${selectedVersion.id}`, {
        systemPrompt: editor.systemPrompt,
        userPromptTemplate: editor.userPromptTemplate,
        variablesSchema: parsedSchema,
      } satisfies UpdatePromptVersionRequest);
      toast({ title: 'Prompt 草稿已保存' });
      await fetchDetail(selectedCode);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '保存 Prompt 版本失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublishVersion = async () => {
    if (!selectedVersion) {
      toast({
        title: '请先选择要发布的版本',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`确定发布 V${selectedVersion.version} 吗？当前已发布版本会自动归档。`)) {
      return;
    }

    setPublishing(true);
    try {
      await api.post<PromptVersionItem>(`/ai/prompts/versions/${selectedVersion.id}/publish`, {});
      toast({ title: `V${selectedVersion.version} 已发布` });
      await fetchDetail(selectedCode);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '发布 Prompt 版本失败',
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleRunTest = async () => {
    let variables: Record<string, unknown>;
    try {
      variables = JSON.parse(variablesText) as Record<string, unknown>;
    } catch {
      toast({
        title: '测试变量不是合法 JSON',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<PromptTestResult>('/ai/prompts/test', {
        templateCode: selectedCode,
        promptVersionId: selectedVersion?.id,
        variables,
      } satisfies PromptTestRequest);
      setTestResult(result);
      toast({ title: 'Prompt 测试完成' });
      const latestLogs = await api.get<PromptTestLogItem[]>('/ai/prompts/test-logs?limit=30');
      setTestLogs(latestLogs);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'Prompt 测试失败',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSelectVersion = (version: PromptVersionItem) => {
    setSelectedVersionId(version.id);
    setEditor({
      systemPrompt: version.systemPrompt,
      userPromptTemplate: version.userPromptTemplate,
      variablesSchema: version.variablesSchema ?? {},
    });
    setVariablesSchemaText(JSON.stringify(version.variablesSchema ?? {}, null, 2));
    setTestResult(null);
  };

  const handleResetToDefault = () => {
    syncEditorFromVersion(null);
    setSelectedVersionId(null);
    setTestResult(null);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link to="/ai/prompts">返回列表</Link>
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Prompt 管理</p>
            <h2 className="text-xl font-semibold text-slate-900">
              {detail?.name || '模板详情'}
            </h2>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{detail?.name || 'Prompt 管理'}</CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  {detail?.description || '这里可以维护 Prompt 版本、发布状态和测试效果。'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleResetToDefault}>
                  回到默认模板
                </Button>
                <Button onClick={handleCreateVersion} disabled={saving || !detail}>
                  {saving ? '创建中...' : '基于当前内容新建草稿'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">版本列表</p>
                {loadingDetail && <p className="text-sm text-muted-foreground">加载中...</p>}
                {detail?.versions.length === 0 && (
                  <p className="text-sm text-muted-foreground">当前只有代码默认模板，还没有数据库版本。</p>
                )}
                {detail?.versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => handleSelectVersion(version)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedVersionId === version.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900">V{version.version}</span>
                      <Badge variant={version.status === 'active' ? 'default' : 'outline'}>
                        {STATUS_LABELS[version.status]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      创建人：{version.createdBy.username}
                    </p>
                    <p className="text-xs text-slate-500">更新时间：{version.updatedAt}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    {selectedVersion
                      ? `编辑 V${selectedVersion.version}（${STATUS_LABELS[selectedVersion.status]}）`
                      : '编辑代码默认模板'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleUpdateVersion}
                      disabled={saving || !selectedVersion || selectedVersion.status !== 'draft'}
                    >
                      {saving ? '保存中...' : '保存草稿'}
                    </Button>
                    <Button
                      onClick={handlePublishVersion}
                      disabled={publishing || !selectedVersion}
                    >
                      {publishing ? '发布中...' : '发布当前版本'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">System Prompt</p>
                  <textarea
                    value={editor.systemPrompt}
                    onChange={(event) =>
                      setEditor((previous) => ({ ...previous, systemPrompt: event.target.value }))
                    }
                    className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">User Prompt Template</p>
                  <textarea
                    value={editor.userPromptTemplate}
                    onChange={(event) =>
                      setEditor((previous) => ({
                        ...previous,
                        userPromptTemplate: event.target.value,
                      }))
                    }
                    className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">变量 Schema（JSON）</p>
                  <textarea
                    value={variablesSchemaText}
                    onChange={(event) => setVariablesSchemaText(event.target.value)}
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    这里存的是模板变量说明，真正运行时仍由服务端安全地注入动态变量。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Prompt 测试台</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">
                    用当前选中的版本做一次真实模型调用，并记录测试日志。
                  </p>
                </div>
                <Button onClick={handleRunTest} disabled={testing}>
                  {testing ? '测试中...' : '运行测试'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  当前测试版本：
                  {selectedVersion ? ` V${selectedVersion.version}` : ' 代码默认模板'}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">测试变量（JSON）</p>
                  <textarea
                    value={variablesText}
                    onChange={(event) => setVariablesText(event.target.value)}
                    className="min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-3 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">输出结果</p>
                  <div className="min-h-[220px] rounded-2xl border bg-slate-50 p-4 text-sm leading-7 text-slate-900">
                    {testResult ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          <Badge variant="outline">
                            来源：{testResult.source === 'database' ? '数据库版本' : '代码默认'}
                          </Badge>
                          <Badge variant="outline">耗时：{testResult.durationMs}ms</Badge>
                          <Badge variant="outline">requestId：{testResult.requestId}</Badge>
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-sm leading-7">
                          {testResult.output}
                        </pre>
                      </div>
                    ) : (
                      '这里会展示当前 Prompt 版本的测试输出。'
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>最近测试日志</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredLogs.length === 0 && (
                  <p className="text-sm text-muted-foreground">当前模板还没有测试日志。</p>
                )}
                {filteredLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={log.success ? 'default' : 'destructive'}>
                          {log.success ? '成功' : '失败'}
                        </Badge>
                        <Badge variant="outline">
                          {log.promptVersionId ? '数据库版本' : '代码默认'}
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-500">{log.durationMs ?? 0}ms</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      操作人：{log.createdBy.username} · {log.createdAt}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                      {log.output || log.errorMessage || '无输出'}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
