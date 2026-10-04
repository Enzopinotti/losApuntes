import { useEffect, useId, useRef, type RefObject } from "react";

import {
  backdropPointerStart,
  isPointOnDialogBackdrop,
  shouldDismissFromBackdrop,
} from "./confirmDialogPointer";
import "./ConfirmDialog.scss";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  returnFocusRef,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const backdropPointerRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }

      cancelButtonRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }

    if (wasOpenRef.current && !open) {
      returnFocusRef?.current?.focus();
    }

    wasOpenRef.current = open;
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPointerRef.current = backdropPointerStart(
          event.pointerId,
          isPointOnDialogBackdrop(bounds, event.clientX, event.clientY),
        );
      }}
      onPointerUp={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const dismiss = shouldDismissFromBackdrop({
          activePointerId: backdropPointerRef.current,
          releasedPointerId: event.pointerId,
          releasedOnBackdrop: isPointOnDialogBackdrop(
            bounds,
            event.clientX,
            event.clientY,
          ),
        });
        backdropPointerRef.current = null;

        if (dismiss) {
          onCancel();
        }
      }}
      onPointerCancel={() => {
        backdropPointerRef.current = null;
      }}
    >
      <div className="confirm-dialog__content">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>

        <div className="confirm-dialog__actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="confirm-dialog__cancel"
            onClick={onCancel}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog__confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
};
