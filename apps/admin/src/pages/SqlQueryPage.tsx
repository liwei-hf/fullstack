import { useEffect, useMemo, useRef, useState } from 'react';
import type { AiConversationMessage, AiConversationSession, AiSqlSseEvent } from '@fullstack/shared';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const EXAMPLES = [
  '今天完成了哪些待办？',
  '当前共有多少个用户？',
  '各部门有多少人？',
  '我的待办里还有多少进行中的任务？',
];

/**
 * 智能问数页
 *
 * 这里改成标准聊天流，用户问题和助手回答会按时间线堆叠，
 * 更适合承载 Redis 短期记忆提供的连续追问能力。
 */
export default function SqlQueryPage() {
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const [sessions, setSessions] = useState<AiConversationSession[]>(() => {
    const loaded = loadConversationSessions('sql');
    return loaded.length > 0 ? loaded : [createConversationSession('sql')];
  });
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const loaded = loadConversationSessions('sql');
    return loaded[0]?.id || '';
  });
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions],
  );

  useEffect(() => {
    saveConversationSessions('sql', sessions);
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

  const handleCreateSession = () => {
    const nextSession = createConversationSession('sql');
    setSessions((previous) => [nextSession, ...previous]);
    setActiveSessionId(nextSession.id);
    setQuestion('');
  };

  const handleSelectSession = (sessionId: string) => {
    setSessions((previous) => updateConversationSessionInList(previous, sessionId, (session) => session));
    setActiveSessionId(sessionId);
  };

  /**
   * 会话删除后需要立刻兜底到下一个可用会话，避免聊天页落入“当前 session 已不存在”的悬空状态。
   */
  const handleDeleteSession = (sessionId: string) => {
    setSessions((previous) => {
      const nextSessions = removeConversationSession(previous, sessionId);
      if (nextSessions.length === 0) {
        const fallbackSession = createConversationSession('sql');
        setActiveSessionId(fallbackSession.id);
        return [fallbackSession];
      }

      if (activeSessionId === sessionId) {
        setActiveSessionId(nextSessions[0]!.id);
      }

      return nextSessions;
    });
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleAsk = async () => {
    if (asking) {
      handleStop();
      return;
    }

    if (!currentSession) {
      return;
    }

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast({
        title: '请输入问题',
        variant: 'destructive',
      });
      return;
    }

    const userMessage = createConversationMessage('user', trimmedQuestion);
    const assistantMessage = createConversationMessage('assistant', '', {
      loadingMessage: '正在理解问题...',
      thinkingExpanded: true,
    });
    const targetSessionId = currentSession.id;
    const nextTitle =
      currentSession.messages.length === 0 ? deriveConversationTitle(trimmedQuestion) : currentSession.title;

    updateSession(targetSessionId, (session) => ({
      ...session,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
      lastMessagePreview: trimmedQuestion,
      messages: [...session.messages, userMessage, assistantMessage],
    }));

    setQuestion('');
    setAsking(true);
    abortRef.current = new AbortController();

    try {
      await api.streamSse<AiSqlSseEvent>(
        '/ai/sql/stream',
        { question: trimmedQuestion, sessionId: currentSession.sessionId || undefined },
        (event) => {
          if (event.type === 'meta') {
            updateSession(targetSessionId, (session) => ({
              ...session,
              sessionId: event.sessionId,
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

          if (event.type === 'sql_generated') {
            updateMessage(targetSessionId, assistantMessage.id, (message) => ({
              ...message,
              sql: event.sql,
            }));
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
        errorMessage: aborted ? '已停止生成' : error instanceof Error ? error.message : '智能问数失败',
      }));

      if (!aborted) {
        toast({
          title: error instanceof Error ? error.message : '智能问数失败',
          variant: 'destructive',
        });
      }
    } finally {
      abortRef.current = null;
      setAsking(false);
    }
  };

  const handleCopySql = async (sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      toast({ title: 'SQL 已复制' });
    } catch {
      toast({
        title: '复制失败，请手动复制',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
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

        <Card className="min-h-[720px]">
          <CardHeader className="border-b">
            <CardTitle>{currentSession?.title || '智能问数'}</CardTitle>
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
                          <span>{message.loadingMessage || '正在生成回答...'}</span>
                        </div>
                      ) : null}

                      {message.role === 'assistant' && message.errorMessage ? (
                        <p className="mt-3 text-sm text-rose-600">{message.errorMessage}</p>
                      ) : null}

                      {message.role === 'assistant' && message.sql ? (
                        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  const nextExpanded = !message.sqlExpanded;
                                  updateMessage(currentSession.id, message.id, (current) => ({
                                    ...current,
                                    sqlExpanded: nextExpanded,
                                  }));
                                }}
                              >
                                {message.sqlExpanded === false ? '▸ SQL' : '▾ SQL'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleCopySql(message.sql!)}
                              >
                                复制
                              </Button>
                            </div>
                          </div>
                          {message.sqlExpanded !== false ? (
                            <pre className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-600">
                              {message.sql}
                            </pre>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-slate-500">
                  先输入一个问题，连续对话会在这里按时间线展开。
                </div>
              )}
            </div>

            <div className="border-t px-6 py-5">
              <div className="mb-3 flex flex-wrap gap-2">
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
              <div className="flex items-end gap-3">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="例如：今天完成了哪些待办？"
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
