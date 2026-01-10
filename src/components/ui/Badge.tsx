import React from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'badge-default',
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-slate-500',
  primary: 'bg-indigo-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-sky-500',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
  dot = false,
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-medium rounded-full
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
};

// Status badge with predefined colors
type StatusType = 'active' | 'inactive' | 'pending' | 'completed' | 'error' | 'draft';

interface StatusBadgeProps {
  status: StatusType;
  size?: BadgeSize;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; variant: BadgeVariant }> = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'default' },
  pending: { label: 'Pending', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  error: { label: 'Error', variant: 'error' },
  draft: { label: 'Draft', variant: 'default' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  className = '',
}) => {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} size={size} dot className={className}>
      {config.label}
    </Badge>
  );
};

export default Badge;
