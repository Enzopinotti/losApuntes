export type DialogBounds = Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}>;

export function isPointOnDialogBackdrop(
  bounds: DialogBounds,
  clientX: number,
  clientY: number,
): boolean {
  return (
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom
  );
}

export function backdropPointerStart(
  pointerId: number,
  startedOnBackdrop: boolean,
): number | null {
  return startedOnBackdrop ? pointerId : null;
}

export function shouldDismissFromBackdrop(input: {
  activePointerId: number | null;
  releasedPointerId: number;
  releasedOnBackdrop: boolean;
}): boolean {
  return (
    input.activePointerId !== null &&
    input.activePointerId === input.releasedPointerId &&
    input.releasedOnBackdrop
  );
}
