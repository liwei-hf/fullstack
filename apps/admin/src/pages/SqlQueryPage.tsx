import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AiConversationMessage, AiConversationSession, AiSqlSseEvent } from '@fullstack/shared';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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
      lastMessage.sql,
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
      <div className="space-y-6">
        <PageHeader
          title="智能问数"
          description="通过自然语言生成 SQL、执行查询并组织结果说明。会话、Think 和 SQL 折叠区都保持与知识库问答同一套交互语言。"
          actions={
            <Button onClick={handleCreateSession} className="h-11 rounded-2xl bg-[#3B82F6] hover:bg-blue-600">
              新建会话
            </Button>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="rounded-[24px] border-slate-200/80 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">会话列表</p>
                <p className="text-xs leading-5 text-slate-500">智能问数会保存最近的连续追问上下文。</p>
              </div>

              {sessions.map((session) => (
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
            </CardContent>
          </Card>

          <div className="flex min-h-[760px] flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <div className="border-b border-slate-100 px-7 py-5">
              <h2 className="text-xl font-semibold text-slate-900">{currentSession?.title || '智能问数'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">先给结果解释，再为后续图表或表格扩展保留结构化展示区域。</p>
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
                            description="模型返回的思考过程，默认折叠。"
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
                            <span>{message.loadingMessage || '正在生成回答...'}</span>
                          </div>
                        ) : null}

                        <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
                          结果表格区域（预留）
                        </div>

                        {message.errorMessage ? (
                          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{message.errorMessage}</p>
                        ) : null}

                        {message.sql ? (
                          <ExpandablePanel
                            title="SQL"
                            description="保留智能问数生成的 SQL，便于排查和讲解。"
                            expanded={message.sqlExpanded !== false}
                            onToggle={() =>
                              updateMessage(currentSession.id, message.id, (current) => ({
                                ...current,
                                sqlExpanded: !current.sqlExpanded,
                              }))
                            }
                          >
                            <div className="space-y-3">
                              <div className="flex justify-end">
                                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => handleCopySql(message.sql!)}>
                                  复制 SQL
                                </Button>
                              </div>
                              <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                                {message.sql}
                              </pre>
                            </div>
                          </ExpandablePanel>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-8 py-16 text-center">
                  <p className="text-base font-medium text-slate-700">先输入一个数据问题</p>
                  <p className="mt-2 text-sm leading-7 text-slate-500">系统会把问题拆成 SQL 生成、查询执行和答案组织三段，连续对话会在这里按时间线展开。</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 bg-white px-7 py-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
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
                  placeholder="例如：最近 30 天完成了哪些任务？"
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
