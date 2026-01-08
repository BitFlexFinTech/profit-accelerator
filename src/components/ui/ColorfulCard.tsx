import { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type CardColor = 'cyan' | 'magenta' | 'yellow' | 'green' | 'orange' | 'purple' | 'pink' | 'blue' | 'red' | 'teal';

interface ColorfulCardProps {
  children: ReactNode;
  color?: CardColor;
  animated?: boolean;
  glowing?: boolean;
  className?: string;
  onClick?: () => void;
}

const colorClassMap: Record<CardColor, string> = {
  cyan: 'card-cyan',
  magenta: 'card-magenta',
  yellow: 'card-yellow',
  green: 'card-green',
  orange: 'card-orange',
  purple: 'card-purple',
  pink: 'card-pink',
  blue: 'card-blue',
  red: 'card-red',
  teal: 'card-teal',
};

const glowClassMap: Record<CardColor, string> = {
  cyan: 'glow-cyan',
  magenta: 'glow-magenta',
  yellow: 'glow-yellow',
  green: 'glow-green',
  orange: 'glow-orange',
  purple: 'glow-purple',
  pink: 'glow-pink',
  blue: 'glow-blue',
  red: 'glow-red',
  teal: 'glow-teal',
};

/**
 * ColorfulCard - A glass card with colorful gradient border
 * Use color prop to set the accent color
 * Use animated prop for float animation
 * Use glowing prop for glow effect
 */
export const ColorfulCard = forwardRef<HTMLDivElement, ColorfulCardProps>(
  ({ children, color, animated = false, glowing = false, className, onClick }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          'glass-card p-4',
          color && colorClassMap[color],
          animated && 'animate-float',
          glowing && color && glowClassMap[color],
          onClick && 'cursor-pointer',
          className
        )}
      >
        {children}
      </div>
    );
  }
);

ColorfulCard.displayName = 'ColorfulCard';

export default ColorfulCard;
