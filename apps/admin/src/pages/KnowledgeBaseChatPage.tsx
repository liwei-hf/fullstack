import { useEffect, useMemo, useRef, useState } from 'react';
import type { AiConversationMessage, AiConversationSession, KnowledgeBaseDetail, KnowledgeBaseItem, RagSseEvent } from '@fullstack/shared';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
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

  useEffect(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth',
    });
  }, [currentSession?.messages]);

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
    if (currentSession) {
      updateSession(currentSession.id, (session) => ({
        ...session,
        knowledgeBaseId: nextKnowledgeBaseId,
      }));
    }
  };

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
      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>会话列表</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={handleCreateSession}>
                  新会话
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`rounded-2xl border p-3 transition ${
                    session.id === currentSession?.id
                      ? 'border-teal-500 bg-teal-50'
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
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>选择知识库</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingKnowledgeBases && <p className="text-sm text-muted-foreground">加载中...</p>}
              {!loadingKnowledgeBases && knowledgeBases.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  还没有已上传文档的知识库，先去“知识库管理”上传文档后再来问答。
                </p>
              )}
              {knowledgeBases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleKnowledgeBaseChange(item.id)}
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
        </div>

        <Card className="min-h-[720px]">
          <CardHeader className="border-b">
            <CardTitle>{detail?.name || currentSession?.title || '知识库问答'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {detail?.description || '当前页面只负责基于知识库内容进行问答。'}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-[640px] flex-col gap-4 p-0">
            <div ref={messageViewportRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
              {currentSession?.messages.length ? (
                currentSession.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-3xl px-4 py-3 shadow-sm ${
                        message.role === 'user'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-900'
                      }`}
                    >
                      {message.role === 'assistant' && message.thinking ? (
                        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                          <button
                            type="button"
                            className="mb-2 flex items-center gap-2 text-[12px] text-amber-700"
                            onClick={() =>
                              updateMessage(currentSession.id, message.id, (current) => ({
                                ...current,
                                thinkingExpanded: !current.thinkingExpanded,
                              }))
                            }
                          >
                            <span>{message.thinkingExpanded ? '▾' : '▸'}</span>
                            <span>Think</span>
                          </button>
                          {message.thinkingExpanded !== false && (
                            <div
                              className="markdown-body text-[13px] leading-6 text-amber-900 opacity-80"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.thinking) }}
                            />
                          )}
                        </div>
                      ) : null}

                      {message.content ? (
                        <div
                          className="markdown-body text-[15px] leading-7"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                        />
                      ) : message.role === 'assistant' && message.status === 'streaming' ? (
                        <div className="flex items-center gap-3 text-sm text-slate-500">
                          <span className="loading-dots" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          <span>{message.loadingMessage || '正在组织答案...'}</span>
                        </div>
                      ) : null}

                      {message.role === 'assistant' && message.errorMessage ? (
                        <p className="mt-3 text-sm text-rose-600">{message.errorMessage}</p>
                      ) : null}

                      {message.role === 'assistant' && message.sources?.length ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <button
                            type="button"
                            className="mb-2 flex items-center gap-2 text-[12px] text-slate-500"
                            onClick={() =>
                              updateMessage(currentSession.id, message.id, (current) => ({
                                ...current,
                                sourcesExpanded: !current.sourcesExpanded,
                              }))
                            }
                          >
                            <span>{message.sourcesExpanded ? '▾' : '▸'}</span>
                            <span>引用来源</span>
                          </button>
                          {message.sourcesExpanded ? (
                            <div className="space-y-3">
                              {message.sources.map((source) => (
                                <div key={source.chunkId} className="rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="text-sm font-medium text-slate-900">{source.documentName}</p>
                                  <p className="mt-1 text-sm leading-6 text-slate-600">{source.snippet}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                  选择知识库后开始提问，连续追问会在这里保留上下文。
                </div>
              )}
            </div>

            <div className="border-t px-6 py-5">
              <div className="flex items-end gap-3">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={selectedId ? '请输入你的问题' : '请先选择知识库'}
                  className="min-h-[110px] flex-1 rounded-2xl border border-input bg-background px-4 py-3 text-sm"
                />
                <Button onClick={handleAsk} className="min-w-[96px]">
                  {asking ? '停止' : '发送'}
                </Button>
              </div>
            </div>
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
