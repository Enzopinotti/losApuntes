export type PasswordVisibilityAction = "toggle" | "mask";

export const passwordVisibilityReducer = (
  visible: boolean,
  action: PasswordVisibilityAction,
): boolean => (action === "toggle" ? !visible : false);
