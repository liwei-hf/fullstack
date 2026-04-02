import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpandablePanelProps {
  title: string;
  description?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  countLabel?: string;
  className?: string;
  contentClassName?: string;
}

/**
 * 统一折叠区组件
 *
 * think、SQL、提示词配置、日志详情里的补充内容都复用这一套交互，
 * 保证后台里的“展开/收起”体验一致。
 */
export function ExpandablePanel({
  title,
  description,
  expanded,
  onToggle,
  children,
  countLabel,
  className,
  contentClassName,
}: ExpandablePanelProps) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            {countLabel ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                {countLabel}
              </span>
            ) : null}
          </div>
          {description ? <p className="text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className={cn('border-t border-slate-100 px-4 py-4', contentClassName)}>{children}</div>
        </div>
      </div>
    </div>
  );
}
