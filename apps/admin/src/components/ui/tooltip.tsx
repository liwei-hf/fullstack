import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * Tooltip 基础封装
 *
 * 用来承载列表页里“文案截断后悬停查看完整内容”的交互，
 * 保持和 shadcn/radix 体系一致，避免每个页面自己手搓浮层。
 */
export function TooltipProvider({
  delayDuration = 120,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />;
}

export function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-md bg-slate-900 px-3 py-2 text-xs leading-5 text-white shadow-lg',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
