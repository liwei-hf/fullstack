import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AiConversationMessage, AiConversationSession, KnowledgeBaseDetail, KnowledgeBaseItem, RagSseEvent } from '@fullstack/shared';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/toaster';
import { ExpandablePanel } from '@/components/expandable-panel';
import { PageHeader } from '@/components/page-header';
import { api } from '@/utils/api';
import {
  createConversationMessage,
  createConversationSession,
  deriveConversationTitle,
  loadConversationSessions,
  removeConversationSession,
  saveConversationSessions,
  updateConversationSessionInList,
} from '@/utils/ai-conversation';
import { renderMarkdown } from '@/utils/markdown';
import { useToast } from '@/hooks/use-toast';

/**
 * 知识库问答页
 *
 * 改成标准聊天流后，连续追问会直接沿着消息时间线展开，
 * 更符合 RAG 问答“围绕同一份文档上下文持续追问”的心智。
 */
export default function KnowledgeBaseChatPage() {
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [question, setQuestion] = useState('');
  const [loadingKnowledgeBases, setLoadingKnowledgeBases] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sessions, setSessions] = useState<AiConversationSession[]>(() => {
    const loaded = loadConversationSessions('knowledge_base');
    return loaded.length > 0 ? loaded : [createConversationSession('knowledge_base')];
  });
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const loaded = loadConversationSessions('knowledge_base');
    return loaded[0]?.id || '';
  });

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );
  const visibleSessions = useMemo(() => {
    if (!selectedId) {
      return sessions.filter((session) => !session.knowledgeBaseId);
    }

    return sessions.filter((session) => session.knowledgeBaseId === selectedId);
  }, [selectedId, sessions]);
  const selectedItem = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedId) ?? null,
    [knowledgeBases, selectedId],
  );

  useEffect(() => {
    saveConversationSessions('knowledge_base', sessions);
  }, [sessions]);

  useEffect(() => {
    if (!currentSession && sessions.length > 0) {
      const firstSession = sessions[0];
      if (firstSession) {
        setActiveSessionId(firstSession.id);
      }
    }
  }, [currentSession, sessions]);

  const latestMessageSignature = useMemo(() => {
    const lastMessage = currentSession?.messages[currentSession.messages.length - 1];
    if (!lastMessage) {
      return '';
    }

    return [
      lastMessage.id,
      lastMessage.content,
      lastMessage.thinking,
      lastMessage.loadingMessage,
      lastMessage.status,
      lastMessage.errorMessage,
      lastMessage.sources?.length || 0,
    ].join('|');
  }, [currentSession]);

  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    const end = messagesEndRef.current;
    if (!viewport || !end) {
      return;
    }

    end.scrollIntoView({
      block: 'end',
      behavior: asking ? 'auto' : 'smooth',
    });
  }, [asking, latestMessageSignature]);

  const updateSession = (sessionId: string, updater: (session: AiConversationSession) => AiConversationSession) => {
    setSessions((previous) => updateConversationSessionInList(previous, sessionId, updater));
  };

  const updateMessage = (
    sessionId: string,
    messageId: string,
    updater: (message: AiConversationMessage) => AiConversationMessage,
  ) => {
    updateSession(sessionId, (session) => ({
      ...session,
      updatedAt: new Date().toISOString(),
      messages: session.messages.map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    }));
  };

  const fetchKnowledgeBases = async (preferredId?: string) => {
    setLoadingKnowledgeBases(true);
    try {
      const response = await api.get<KnowledgeBaseItem[]>('/knowledge-base');
      const filteredKnowledgeBases = response.filter((item) => item.documentCount > 0);
      setKnowledgeBases(filteredKnowledgeBases);
      const nextSelectedId =
        preferredId !== undefined
          ? preferredId || filteredKnowledgeBases[0]?.id || ''
          : currentSession?.knowledgeBaseId &&
              filteredKnowledgeBases.some((item) => item.id === currentSession.knowledgeBaseId)
            ? currentSession.knowledgeBaseId
            : filteredKnowledgeBases[0]?.id || '';
      setSelectedId(nextSelectedId);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '获取知识库失败',
        variant: 'destructive',
      });
    } finally {
      setLoadingKnowledgeBases(false);
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

  useEffect(() => {
    if (currentSession?.knowledgeBaseId && currentSession.knowledgeBaseId !== selectedId) {
      setSelectedId(currentSession.knowledgeBaseId);
    }
  }, [currentSession?.knowledgeBaseId, selectedId]);

  const handleCreateSession = () => {
    const nextSession = createConversationSession('knowledge_base', {
      knowledgeBaseId: selectedId || undefined,
    });
    setSessions((previous) => [nextSession, ...previous]);
    setActiveSessionId(nextSession.id);
    setQuestion('');
  };

  const handleSelectSession = (sessionId: string) => {
    setSessions((previous) => updateConversationSessionInList(previous, sessionId, (session) => session));
    setActiveSessionId(sessionId);
  };

  /**
   * 删除知识库会话时要保留至少一个本地会话，同时在切换目标会话后恢复对应的知识库绑定。
   */
  const handleDeleteSession = (sessionId: string) => {
    setSessions((previous) => {
      const nextSessions = removeConversationSession(previous, sessionId);
      if (nextSessions.length === 0) {
        const fallbackSession = createConversationSession('knowledge_base', {
          knowledgeBaseId: selectedId || undefined,
        });
        setActiveSessionId(fallbackSession.id);
        return [fallbackSession];
      }

      if (activeSessionId === sessionId) {
        const nextActiveSession = nextSessions[0]!;
        setActiveSessionId(nextActiveSession.id);
        setSelectedId(nextActiveSession.knowledgeBaseId || '');
      }

      return nextSessions;
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleKnowledgeBaseChange = (nextKnowledgeBaseId: string) => {
    setSelectedId(nextKnowledgeBaseId);
    const matchedSession = sessions.find((session) => session.knowledgeBaseId === nextKnowledgeBaseId);
    if (matchedSession) {
      handleSelectSession(matchedSession.id);
      return;
    }

    const nextSession = createConversationSession('knowledge_base', {
      knowledgeBaseId: nextKnowledgeBaseId,
    });
    setSessions((previous) => [nextSession, ...previous]);
    setActiveSessionId(nextSession.id);
    setQuestion('');
  };

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (currentSession?.knowledgeBaseId === selectedId) {
      return;
    }

    const matchedSession = sessions.find((session) => session.knowledgeBaseId === selectedId);
    if (matchedSession) {
      setActiveSessionId(matchedSession.id);
      return;
    }

    const nextSession = createConversationSession('knowledge_base', {
      knowledgeBaseId: selectedId,
    });
    setSessions((previous) => [nextSession, ...previous]);
    setActiveSessionId(nextSession.id);
  }, [currentSession?.knowledgeBaseId, selectedId, sessions]);

  const handleAsk = async () => {
    if (asking) {
      handleStop();
      return;
    }

    if (!currentSession) {
      return;
    }

    if (!selectedId) {
      toast({ title: '请先选择知识库', variant: 'destructive' });
      return;
    }

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast({ title: '请输入问题', variant: 'destructive' });
      return;
    }

    const userMessage = createConversationMessage('user', trimmedQuestion);
    const assistantMessage = createConversationMessage('assistant', '', {
      loadingMessage: '正在检索知识库内容...',
      thinkingExpanded: true,
      sourcesExpanded: false,
    });
    const targetSessionId = currentSession.id;
    const nextTitle =
      currentSession.messages.length === 0 ? deriveConversationTitle(trimmedQuestion) : currentSession.title;

    updateSession(targetSessionId, (session) => ({
      ...session,
      title: nextTitle,
      knowledgeBaseId: selectedId,
      updatedAt: new Date().toISOString(),
      lastMessagePreview: trimmedQuestion,
      messages: [...session.messages, userMessage, assistantMessage],
    }));

    setQuestion('');
    setAsking(true);
    abortRef.current = new AbortController();

    try {
      await api.streamSse<RagSseEvent>(
        `/knowledge-base/${selectedId}/chat/stream`,
        { question: trimmedQuestion, sessionId: currentSession.sessionId || undefined },
        (event) => {
          if (event.type === 'meta') {
            updateSession(targetSessionId, (session) => ({
              ...session,
              sessionId: event.sessionId,
              knowledgeBaseId: event.knowledgeBaseId,
              updatedAt: new Date().toISOString(),
            }));
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              sessionId: event.sessionId,
            }));
            return;
          }

          if (event.type === 'loading') {
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              loadingMessage: event.message,
            }));
            return;
          }

          if (event.type === 'thinking_delta') {
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              thinking: `${message.thinking || ''}${event.delta}`,
            }));
            return;
          }

          if (event.type === 'thinking_done') {
            return;
          }

          if (event.type === 'answer_delta') {
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              content: `${message.content}${event.delta}`,
              thinkingExpanded: message.thinking ? false : message.thinkingExpanded,
            }));
            return;
          }

          if (event.type === 'sources') {
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              sources: event.items,
            }));
            return;
          }

          if (event.type === 'done') {
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              status: 'done',
              loadingMessage: '',
            }));
            return;
          }

          if (event.type === 'error') {
            throw new Error(event.message);
          }
        },
        abortRef.current.signal,
      );
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      updateMessage(targetSessionId, assistantMessage.id, (message) => ({
        ...message,
        status: aborted ? 'done' : 'error',
        loadingMessage: '',
        errorMessage: aborted ? '已停止生成' : error instanceof Error ? error.message : '知识库问答失败',
      }));

      if (!aborted) {
        toast({
          title: error instanceof Error ? error.message : '知识库问答失败',
          variant: 'destructive',
        });
      }
    } finally {
      abortRef.current = null;
      setAsking(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="知识库问答"
          description="围绕同一份知识库连续追问，保留 Think、答案正文和引用来源，适合作为知识型 AI 助手的核心交互界面。"
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedId} onValueChange={handleKnowledgeBaseChange}>
                <SelectTrigger className="h-11 min-w-[240px] rounded-2xl border-slate-200 bg-white px-4 text-sm shadow-none focus:ring-blue-200">
                  <SelectValue placeholder={knowledgeBases.length ? '选择知识库' : '暂无可问答知识库'} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200">
                  {knowledgeBases.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleCreateSession} className="h-11 rounded-2xl bg-[#3B82F6] hover:bg-blue-600">
                新建会话
              </Button>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">会话列表</p>
                <p className="text-xs leading-5 text-slate-500">当前仅展示所选知识库下的历史会话。</p>
              </div>

              {visibleSessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-[20px] border p-3 transition ${
                    session.id === currentSession?.id
                      ? 'border-blue-200 bg-blue-50/70'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => handleSelectSession(session.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-slate-900">{session.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {session.lastMessagePreview || '新会话，等待第一轮提问'}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label={`删除会话 ${session.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-rose-500"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {!loadingKnowledgeBases && knowledgeBases.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  还没有已上传文档的知识库，先去“知识库管理”上传文档后再来问答。
                </div>
              ) : null}

              {visibleSessions.length === 0 && knowledgeBases.length > 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  当前知识库还没有历史会话，开始第一轮提问后会自动建立会话。
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex min-h-[760px] flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <div className="border-b border-slate-100 px-7 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {detail?.name || currentSession?.title || '知识库问答'}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    {detail?.description || '当前页面只负责基于知识库内容进行问答。'}
                  </p>
                </div>
                {selectedItem ? (
                  <Badge variant="outline" className="rounded-full border-blue-100 bg-blue-50 text-blue-600">
                    文档 {selectedItem.readyDocumentCount}/{selectedItem.documentCount}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div ref={messageViewportRef} className="flex-1 space-y-6 overflow-y-auto px-7 py-7">
              {currentSession?.messages.length ? (
                currentSession.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'user' ? (
                      <div className="max-w-[72%] rounded-[24px] bg-blue-500 px-5 py-4 text-sm leading-7 text-white shadow-[0_12px_24px_rgba(59,130,246,0.16)]">
                        {message.content}
                      </div>
                    ) : (
                      <div className="max-w-[86%] space-y-3 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#FFFFFF_0%,#F9FBFF_100%)] p-4">
                        {message.thinking ? (
                          <ExpandablePanel
                            title="Think"
                            description="默认折叠，仅在模型返回思考内容时显示。"
                            expanded={message.thinkingExpanded !== false}
                            onToggle={() =>
                              updateMessage(currentSession.id, message.id, (current) => ({
                                ...current,
                                thinkingExpanded: !current.thinkingExpanded,
                              }))
                            }
                          >
                            <div
                              className="markdown-body text-sm leading-7 text-slate-600"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.thinking) }}
                            />
                          </ExpandablePanel>
                        ) : null}

                        {message.content ? (
                          <div
                            className="markdown-body px-1 text-[15px] leading-8 text-slate-800"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                          />
                        ) : message.status === 'streaming' ? (
                          <div className="flex items-center gap-3 rounded-[20px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            <span className="loading-dots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                            <span>{message.loadingMessage || '正在组织答案...'}</span>
                          </div>
                        ) : null}

                        {message.errorMessage ? (
                          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{message.errorMessage}</p>
                        ) : null}

                        {message.sources?.length ? (
                          <ExpandablePanel
                            title="引用来源"
                            description="根据命中的文档片段给出引用，方便追溯回答依据。"
                            expanded={message.sourcesExpanded !== false}
                            onToggle={() =>
                              updateMessage(currentSession.id, message.id, (current) => ({
                                ...current,
                                sourcesExpanded: !current.sourcesExpanded,
                              }))
                            }
                            countLabel={`${message.sources.length} 条`}
                          >
                            <div className="grid gap-3">
                              {message.sources.map((source) => (
                                <div key={source.chunkId} className="rounded-[18px] border border-slate-200/80 bg-slate-50/70 p-4">
                                  <p className="text-sm font-medium text-slate-900">{source.documentName}</p>
                                  <p className="mt-2 text-sm leading-6 text-slate-600">{source.snippet}</p>
                                </div>
                              ))}
                            </div>
                          </ExpandablePanel>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-8 py-16 text-center">
                  <p className="text-base font-medium text-slate-700">从当前知识库开始第一轮提问</p>
                  <p className="mt-2 text-sm leading-7 text-slate-500">连续追问会保留在当前会话里，适合围绕同一份知识内容逐步深入。</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 bg-white px-7 py-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {['请解释当前知识库的核心内容', '列出 3 条关键规定', '给我一个简短总结'].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setQuestion(example)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-white"
                  >
                    {example}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (!currentSession) {
                      return;
                    }
                    updateSession(currentSession.id, (session) => ({
                      ...session,
                      messages: [],
                      lastMessagePreview: '',
                      updatedAt: new Date().toISOString(),
                    }));
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 transition hover:border-slate-300"
                >
                  清空上下文
                </button>
              </div>

              <div className="flex items-end gap-3">
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={selectedId ? '请输入你的问题，Enter 发送，Shift+Enter 换行' : '请先选择知识库'}
                  className="min-h-[108px] flex-1 rounded-[24px] border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-7 focus-visible:ring-blue-200"
                />
                <Button onClick={handleAsk} className="h-12 min-w-[112px] rounded-2xl bg-[#3B82F6] hover:bg-blue-600">
                  {asking ? '停止' : '发送'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
      <style>{`
        .markdown-body p { margin: 0 0 12px; }
        .markdown-body ul, .markdown-body ol { margin: 0 0 12px 20px; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { margin: 0 0 12px; font-weight: 700; }
        .markdown-body blockquote { margin: 0 0 12px; padding-left: 12px; border-left: 3px solid #CBD5E1; color: #475569; }
        .markdown-body code { padding: 2px 6px; border-radius: 6px; background: #E2E8F0; font-size: 0.92em; }
        .markdown-body pre { overflow-x: auto; margin: 0; border-radius: 12px; background: transparent; padding: 0; color: inherit; }
        .markdown-body pre code { background: transparent; padding: 0; color: inherit; }
        .markdown-body a { color: #0F766E; text-decoration: underline; }
        .loading-dots { display: inline-flex; align-items: center; gap: 6px; }
        .loading-dots span { width: 8px; height: 8px; border-radius: 999px; background: #0f766e; opacity: 0.3; animation: aiDots 1.1s infinite ease-in-out; }
        .loading-dots span:nth-child(2) { animation-delay: 0.15s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes aiDots {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.25; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
