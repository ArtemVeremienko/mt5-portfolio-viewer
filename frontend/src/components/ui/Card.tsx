import { splitProps, type JSX, type ParentComponent } from 'solid-js';

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md';
}

export const Card: ParentComponent<CardProps> = (props) => {
  const [local, rest] = splitProps(props, ['padding', 'class', 'children']);
  const padClass = () => {
    if (local.padding === 'none') return '';
    if (local.padding === 'sm') return 'p-3';
    return 'p-5';
  };
  return (
    <div
      class={`rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl ${padClass()} ${local.class ?? ''}`}
      {...rest}
    >
      {local.children}
    </div>
  );
};
