import { mergeProps, splitProps, type JSX, type ParentComponent } from 'solid-js';

export type BadgeVariant = 'neutral' | 'profit' | 'loss' | 'warn' | 'r' | 'info';

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
  profit: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  loss: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  r: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

export const Badge: ParentComponent<BadgeProps> = (rawProps) => {
  const props = mergeProps({ variant: 'neutral' as BadgeVariant }, rawProps);
  const [local, rest] = splitProps(props, ['variant', 'class', 'children']);
  return (
    <span
      class={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${VARIANT_CLASSES[local.variant]} ${local.class ?? ''}`}
      {...rest}
    >
      {local.children}
    </span>
  );
};
