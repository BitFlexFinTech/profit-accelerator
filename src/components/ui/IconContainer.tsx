import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardColor } from './ColorfulCard';

interface IconContainerProps {
  children: ReactNode;
  color: CardColor;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

const sizeClassMap = {
  sm: 'p-1.5 rounded-md',
  md: 'p-2 rounded-lg',
  lg: 'p-3 rounded-xl',
};

const colorClassMap: Record<CardColor, string> = {
  cyan: 'icon-container-cyan',
  magenta: 'icon-container-magenta',
  yellow: 'icon-container-yellow',
  green: 'icon-container-green',
  orange: 'icon-container-orange',
  purple: 'icon-container-purple',
  pink: 'icon-container-pink',
  blue: 'icon-container-blue',
  red: 'icon-container-red',
  teal: 'icon-container-teal',
};

/**
 * IconContainer - A colorful background container for icons
 */
export function IconContainer({ 
  children, 
  color, 
  size = 'md', 
  animated = false,
  className 
}: IconContainerProps) {
  return (
    <div 
      className={cn(
        sizeClassMap[size],
        colorClassMap[color],
        animated && 'animate-bounce-subtle',
        'transition-all duration-300',
        className
      )}
    >
      {children}
    </div>
  );
}

export default IconContainer;
