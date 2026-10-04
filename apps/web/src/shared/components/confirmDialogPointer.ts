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
