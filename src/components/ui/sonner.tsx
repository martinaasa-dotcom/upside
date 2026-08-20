"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group keyboard-chrome"
      /*
       * Both offsets, not just `offset`. Sonner swaps to `mobileOffset`
       * below its 600px breakpoint and ignores `offset` entirely there, so
       * on a phone the toaster fell back to sonner's own 16px and every
       * toast landed on top of the bottom tab bar — measured on a Pixel 7:
       * toast at y=770 over a nav starting at y=774. `--dock-pad` carries
       * the dock's real measured height (useDockPad), so this clears
       * whatever the dock currently is rather than guessing in rem.
       */
      offset="max(1.25rem, calc(var(--dock-pad, 1.25rem) + 0.75rem))"
      mobileOffset="max(1.25rem, calc(var(--dock-pad, 1.25rem) + 0.75rem))"
      icons={{
        success: <CircleCheckIcon />,
        info: <InfoIcon />,
        warning: <TriangleAlertIcon />,
        error: <OctagonXIcon />,
        loading: <Loader2Icon className="animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
