import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    orientation?: "vertical" | "horizontal";
    scrollBarClassName?: React.HTMLAttributes<HTMLDivElement>["className"];
    fitContainer?: boolean;
  }
>(
  (
    {
      className,
      children,
      orientation,
      scrollBarClassName,
      fitContainer,
      ...props
    },
    ref
  ) => {
    const Wrapper = fitContainer ? FitScrollToContainer : Slot;

    return (
      <Wrapper>
        <ScrollAreaPrimitive.Root
          ref={ref}
          className={cn("relative ", className)}
          {...props}
        >
          <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
            {children}
          </ScrollAreaPrimitive.Viewport>
          <ScrollBar orientation={orientation} className={scrollBarClassName} />
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      </Wrapper>
    );
  }
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const FitScrollToContainer = ({ children }: React.PropsWithChildren) => {
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <Slot className="h-full w-full">{children}</Slot>
      </div>
    </div>
  );
};

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
