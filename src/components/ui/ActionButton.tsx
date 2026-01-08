import { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ActionButtonProps extends ButtonProps {
  tooltip: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * ActionButton - A Button wrapped with a tooltip
 * Use this for all action buttons to ensure consistent tooltip behavior
 */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ tooltip, tooltipSide = 'top', children, ...props }, ref) => {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button ref={ref} {...props}>
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