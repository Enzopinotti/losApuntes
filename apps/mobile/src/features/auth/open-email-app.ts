import { startActivityAsync } from "expo-intent-launcher";

export async function openEmailApp(): Promise<boolean> {
  try {
    await startActivityAsync("android.intent.action.MAIN", {
      category: "android.intent.category.APP_EMAIL",
    });
    return true;
  } catch {
    return false;
  }
}
