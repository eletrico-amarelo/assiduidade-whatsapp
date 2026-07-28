import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Button({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'icon';
}) {
  return (
    <button
      className={cn('ui-button', `ui-button-${variant}`, size === 'icon' && 'ui-button-icon', className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('ui-card', className)} {...props} />;
}

export function Badge({
  variant = 'secondary',
  className,
  children,
}: {
  variant?: 'secondary' | 'success' | 'warning' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn('ui-badge', `ui-badge-${variant}`, className)}>{children}</span>;
}
