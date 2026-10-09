"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// Ported verbatim from Shreyasmark1/leave-management-system
// (src/components/form-item.tsx).
interface FormItemProps {
  label: string;
  htmlFor: string;
  error?: string;
  description?: string;
  children: ReactNode;
}

export function FormItem({ label, htmlFor, error, description, children }: FormItemProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
