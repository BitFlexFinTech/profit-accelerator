import { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ButtonColorVariant = 'cyan' | 'magenta' | 'yellow' | 'green' | 'orange' | 'purple' | 'pink' | 'blue' | 'red' | 'teal';

interface ActionButtonProps extends ButtonProps {
  tooltip: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  colorVariant?: ButtonColorVariant;
}

const colorVariantClasses: Record<ButtonColorVariant, string> = {
  cyan: 'hover:border-[hsl(185_100%_50%/0.5)] hover:bg-[hsl(185_100%_50%/0.1)] hover:shadow-[0_0_15px_hsl(185_100%_50%/0.2)]',
  magenta: 'hover:border-[hsl(310_100%_60%/0.5)] hover:bg-[hsl(310_100%_60%/0.1)] hover:shadow-[0_0_15px_hsl(310_100%_60%/0.2)]',
  yellow: 'hover:border-[hsl(42_100%_55%/0.5)] hover:bg-[hsl(42_100%_55%/0.1)] hover:shadow-[0_0_15px_hsl(42_100%_55%/0.2)]',
  green: 'hover:border-[hsl(155_85%_50%/0.5)] hover:bg-[hsl(155_85%_50%/0.1)] hover:shadow-[0_0_15px_hsl(155_85%_50%/0.2)]',
  orange: 'hover:border-[hsl(25_100%_55%/0.5)] hover:bg-[hsl(25_100%_55%/0.1)] hover:shadow-[0_0_15px_hsl(25_100%_55%/0.2)]',
  purple: 'hover:border-[hsl(270_70%_60%/0.5)] hover:bg-[hsl(270_70%_60%/0.1)] hover:shadow-[0_0_15px_hsl(270_70%_60%/0.2)]',
  pink: 'hover:border-[hsl(335_85%_65%/0.5)] hover:bg-[hsl(335_85%_65%/0.1)] hover:shadow-[0_0_15px_hsl(335_85%_65%/0.2)]',
  blue: 'hover:border-[hsl(210_100%_60%/0.5)] hover:bg-[hsl(210_100%_60%/0.1)] hover:shadow-[0_0_15px_hsl(210_100%_60%/0.2)]',
  red: 'hover:border-[hsl(350_90%_55%/0.5)] hover:bg-[hsl(350_90%_55%/0.1)] hover:shadow-[0_0_15px_hsl(350_90%_55%/0.2)]',
  teal: 'hover:border-[hsl(175_80%_45%/0.5)] hover:bg-[hsl(175_80%_45%/0.1)] hover:shadow-[0_0_15px_hsl(175_80%_45%/0.2)]',
};

/**
 * ActionButton - A Button wrapped with a tooltip and optional color variant
 * Use this for all action buttons to ensure consistent tooltip behavior
 * The colorVariant prop adds hover glow effects in the specified color
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ tooltip, tooltipSide = 'top', colorVariant, children, className, ...props }, ref) => {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              ref={ref} 
              className={cn(
                'transition-all duration-300',
                colorVariant && colorVariantClasses[colorVariant],
                className
              )}
              {...props}
            >
              {children}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide} className="max-w-[250px] text-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
);

ActionButton.displayName = 'ActionButton';