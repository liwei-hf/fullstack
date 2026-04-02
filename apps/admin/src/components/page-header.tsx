import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * 后台页面统一标题头
 *
 * 所有管理页共用同一套标题与说明层级，
 * 让业务页和 AI 页在视觉上保持统一系统感。
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-slate-200/80 bg-white/90 px-6 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)] backdrop-blur sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}
