import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  PromptTemplateCode,
  PromptTemplateDetail,
  PromptTestLogItem,
  PromptTestRequest,
  PromptTestResult,
  UpdatePromptTemplateRequest,
} from '@fullstack/shared';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/toaster';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

const TEMPLATE_TEST_EXAMPLES: Record<PromptTemplateCode, Record<string, unknown>> = {
  sql_generation: {
    question: '今天完成了哪些待办？',
    conversationSummaryText:
      '较早轮次 1：\n- 用户关注：先看看最近有哪些任务变化\n- 已回答要点：系统已经列出了最近新增和完成的任务。',
    recentConversationText:
      '最近对话 1：\n用户：那完成的任务呢？\n助手：已整理出最近完成的任务清单。',
    currentUserRules:
      '当前登录用户信息：\\n- 当前登录用户的真实 "User"."id" = \'cmn_demo_user\'',
    roleRules:
      '你是管理员查询 SQL 生成器。可以查询 "User"、"Department"、"Todo" 的全量数据。',
    sqlSchemaDescription:
      '表："User"、"Department"、"Todo"，字段名必须使用双引号，Todo.status 只允许 TODO / IN_PROGRESS / DONE。',
  },
  sql_answer: {
    question: '今天完成了哪些待办？',
    role: 'admin',
    conversationSummaryText:
      '较早轮次 1：\n- 用户关注：先看看最近有哪些任务变化\n- 已回答要点：系统已经列出了最近新增和完成的任务。',
    recentConversationText:
      '最近对话 1：\n用户：那完成的任务呢？\n助手：已整理出最近完成的任务清单。',
    rowsJson:
      '[{"title":"研发部补充接口文档","status":"DONE","updatedAt":"2026-04-01T10:00:00.000Z"}]',
  },
  knowledge_base_answer: {
    question: '请用一句话总结员工手册的核心内容，并列出 3 个关键规定。',
    conversationSummaryText:
      '较早轮次 1：\n- 用户关注：想先快速了解员工手册整体要求\n- 已回答要点：员工手册以考勤、请假和行为规范为核心。',
    answerHistoryText:
      '最近对话 1：\n用户：先总结一下员工手册。\n助手：员工手册主要规范了考勤、请假和日常行为要求。',
    contextText:
      '片段 1：员工手册规定员工需遵守考勤制度，每日 9:00 前打卡。\\n\\n片段 2：请假需提前提交申请，病假需补充医院证明。',
  },
  knowledge_base_retrieval_rewrite: {
    question: '那病假需要什么材料？',
    conversationSummaryText:
      '较早轮次 1：\n- 用户关注：正在围绕员工手册里的请假制度连续追问\n- 已回答要点：请假需要提前提交申请。',
    retrievalHistoryText:
      '最近对话 1：\n用户：员工请假流程是什么？\n助手：需要提前提交请假申请并按制度审批。',
  },
};

export default function PromptManagementPage() {
  const { toast } = useToast();
  const params = useParams<{ code: PromptTemplateCode }>();
  const selectedCode = params.code as PromptTemplateCode | undefined;
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [editor, setEditor] = useState<UpdatePromptTemplateRequest>({
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
  const [testing, setTesting] = useState(false);

  if (!selectedCode || !(selectedCode in TEMPLATE_TEST_EXAMPLES)) {
    return <Navigate to="/ai/prompts" replace />;
  }

  const filteredLogs = useMemo(
    () => testLogs.filter((item) => item.templateCode === selectedCode),
    [selectedCode, testLogs],
  );

  const syncEditorFromDetail = (template: PromptTemplateDetail) => {
    setEditor({
      systemPrompt: template.systemPrompt,
      userPromptTemplate: template.userPromptTemplate,
      variablesSchema: template.variablesSchema ?? {},
    });
    setVariablesSchemaText(JSON.stringify(template.variablesSchema ?? {}, null, 2));
    setVariablesText(JSON.stringify(TEMPLATE_TEST_EXAMPLES[template.code], null, 2));
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
      syncEditorFromDetail(detailResponse);
      setTestResult(null);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '获取提示词详情失败',
        variant: 'destructive',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void fetchDetail(selectedCode);
  }, [selectedCode]);

  const handleSaveTemplate = async () => {
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
      const updated = await api.patch<PromptTemplateDetail>(`/ai/prompts/templates/${selectedCode}`, {
        systemPrompt: editor.systemPrompt,
        userPromptTemplate: editor.userPromptTemplate,
        variablesSchema: parsedSchema,
      } satisfies UpdatePromptTemplateRequest);
      setDetail(updated);
      syncEditorFromDetail(updated);
      toast({ title: '提示词模板已保存' });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '保存提示词模板失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToCurrent = () => {
    if (detail) {
      syncEditorFromDetail(detail);
      setTestResult(null);
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
        variables,
      } satisfies PromptTestRequest);
      setTestResult(result);
      const latestLogs = await api.get<PromptTestLogItem[]>('/ai/prompts/test-logs?limit=30');
      setTestLogs(latestLogs);
      toast({ title: '提示词测试完成' });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '提示词测试失败',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title={detail?.name || '提示词模板'}
          description={detail?.description || '直接维护当前生效的系统提示词、用户提示词和变量 Schema。'}
          actions={
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/ai/prompts">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回列表
              </Link>
            </Button>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="h-fit rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">模板概览</p>
                <h2 className="text-2xl font-semibold text-slate-900">{detail?.name || '加载中...'}</h2>
                <p className="text-sm leading-7 text-slate-500">
                  {detail?.description || '当前模板用于管理 AI 系统提示词与测试输入输出。'}
                </p>
              </div>

              <div className="rounded-[20px] bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                <p>模板编码：{selectedCode}</p>
                <p className="mt-2">当前模式：直接编辑当前模板内容</p>
              </div>

              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full rounded-2xl bg-[#3B82F6] hover:bg-blue-600"
                  onClick={handleSaveTemplate}
                  disabled={saving || !detail}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? '保存中...' : '保存模板'}
                </Button>
                <Button type="button" variant="outline" className="w-full rounded-2xl" onClick={handleResetToCurrent}>
                  恢复当前内容
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
              <CardHeader>
                <CardTitle>模板编辑区</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {loadingDetail ? <p className="text-sm text-slate-500">加载中...</p> : null}

                <FieldBlock label="系统提示词">
                  <Textarea
                    value={editor.systemPrompt}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        systemPrompt: event.target.value,
                      }))
                    }
                    className="min-h-[180px] rounded-2xl border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-7 focus-visible:ring-blue-200"
                  />
                </FieldBlock>

                <FieldBlock label="用户提示词模板">
                  <Textarea
                    value={editor.userPromptTemplate}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        userPromptTemplate: event.target.value,
                      }))
                    }
                    className="min-h-[240px] rounded-2xl border-slate-200 bg-slate-50/60 px-4 py-3 text-sm leading-7 focus-visible:ring-blue-200"
                  />
                </FieldBlock>

                <FieldBlock label="变量 Schema">
                  <Textarea
                    value={variablesSchemaText}
                    onChange={(event) => setVariablesSchemaText(event.target.value)}
                    className="min-h-[180px] rounded-2xl border-slate-200 bg-slate-950 px-4 py-3 font-mono text-sm leading-7 text-slate-100 focus-visible:ring-blue-200"
                  />
                </FieldBlock>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-blue-500" />
                    测试区
                  </CardTitle>
                  <Button onClick={handleRunTest} disabled={testing} className="rounded-2xl bg-[#3B82F6] hover:bg-blue-600">
                    {testing ? '测试中...' : '运行测试'}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FieldBlock label="测试输入 JSON">
                    <Textarea
                      value={variablesText}
                      onChange={(event) => setVariablesText(event.target.value)}
                      className="min-h-[220px] rounded-2xl border-slate-200 bg-slate-950 px-4 py-3 font-mono text-sm leading-7 text-slate-100 focus-visible:ring-blue-200"
                    />
                  </FieldBlock>

                  {testResult ? (
                    <div className="space-y-4 rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <p className="font-medium text-emerald-700">
                          当前模板测试完成 · {testResult.durationMs}ms
                        </p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs text-emerald-700">
                          {testResult.source === 'database' ? '当前模板' : '代码默认模板'}
                        </span>
                      </div>
                      <FieldBlock label="模型输出">
                        <div className="rounded-2xl bg-white px-4 py-4 text-sm leading-7 text-slate-700">
                          {testResult.output}
                        </div>
                      </FieldBlock>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                <CardHeader>
                  <CardTitle>测试日志</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredLogs.length === 0 ? (
                    <p className="text-sm text-slate-500">当前模板还没有测试记录。</p>
                  ) : (
                    filteredLogs.map((log) => (
                      <div key={log.id} className="rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900">
                            {log.success ? '测试成功' : '测试失败'}
                          </p>
                          <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString('zh-CN')}</p>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          执行人：{log.createdBy.username}
                          {log.durationMs ? ` · ${log.durationMs}ms` : ''}
                        </p>
                        {log.errorMessage ? (
                          <p className="mt-2 text-sm text-rose-500">{log.errorMessage}</p>
                        ) : (
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{log.output}</p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
