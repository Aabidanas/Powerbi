"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";

// Adapted from the shadcn/ui New York Radix dialog for the DATA QUEST theme.
function DialogContent({ children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay data-slot="dialog-overlay" className="dialog-overlay"/>
    <DialogPrimitive.Content data-slot="dialog-content" className="card dialog" {...props}>
      {children}
      <DialogPrimitive.Close data-slot="dialog-close" className="icon-button dialog-close" aria-label="Close dialog"><X size={18}/></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}

export function Popup({ label, title, children, className = "button secondary small-button" }: {
  label: ReactNode; title: string; children: ReactNode | ((close: () => void) => ReactNode); className?: string;
}) {
  const [open, setOpen] = useState(false);
  return <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
    <DialogPrimitive.Trigger data-slot="dialog-trigger" className={className}>{label}</DialogPrimitive.Trigger>
    <DialogContent aria-describedby={undefined}>
      <DialogPrimitive.Title data-slot="dialog-title" asChild><h2>{title}</h2></DialogPrimitive.Title>
      {typeof children === "function" ? children(() => setOpen(false)) : children}
    </DialogContent>
  </DialogPrimitive.Root>;
}
