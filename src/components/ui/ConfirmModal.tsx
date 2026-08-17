"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Return false (or Promise resolving to false) to keep the dialog open
   * after a failed confirm.
   */
  onConfirm: () => void | boolean | Promise<void | boolean>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) {
      busyRef.current = false;
      setBusy(false);
      setError(null);
    }
  }, [open]);

  async function runConfirm() {
    if (busy) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result === false) {
        setError("That didn't work. Try again.");
        return;
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That didn't work. Try again."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busyRef.current) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={() => void runConfirm()}
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {busy ? "…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
