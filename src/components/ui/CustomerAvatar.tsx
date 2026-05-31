import React from 'react';
import { cva } from 'class-variance-authority';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface CustomerAvatarProps {
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
  clickable?: boolean;
  ariaLabel?: string;
  ref?: React.Ref<HTMLDivElement | HTMLButtonElement>;
}

export const avatarVariants = cva(
  'rounded-2xl flex items-center justify-center overflow-hidden',
  {
    variants: {
      size: {
        sm: 'w-10 h-10 text-sm',
        md: 'w-14 h-14 text-base',
        lg: 'w-20 h-20 text-xl',
        xl: 'w-24 h-24 text-2xl',
      },
      interactive: {
        true: 'cursor-pointer transition-all hover:scale-105 hover:ring-4 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      interactive: false,
    },
  },
);

export const CustomerAvatar: React.FC<CustomerAvatarProps> = ({
  firstName,
  lastName,
  photoUrl,
  size = 'md',
  className = '',
  onClick,
  clickable = false,
  ariaLabel,
  ref,
}) => {
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = React.useState(false);
  const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
  const interactive = Boolean(clickable || onClick);
  const showPhoto = Boolean(photoUrl) && !imageFailed;

  const handleClick = () => {
    if (interactive) {
      onClick?.();
    }
  };

  const interactiveProps = interactive
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': ariaLabel ?? t('ui.avatar.viewPhoto', { name: `${firstName} ${lastName}`.trim() }),
        onClick: handleClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        },
      }
    : {};

  if (showPhoto) {
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(avatarVariants({ size, interactive }), className)}
        {...interactiveProps}
      >
        <img
          src={photoUrl ?? undefined}
          alt={`${firstName} ${lastName}`}
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn(
        avatarVariants({ size, interactive }),
        'bg-primary text-primary-foreground font-semibold shadow-md',
        className,
      )}
      {...interactiveProps}
    >
      {initials}
    </div>
  );
};
