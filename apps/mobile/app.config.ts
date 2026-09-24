import type { ConfigContext, ExpoConfig } from "expo/config";

const requiredPublic = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const easProjectId = requiredPublic("LOSAPUNTES_MOBILE_EAS_PROJECT_ID");

  return {
    ...config,
    name: "Los Apuntes",
    slug: "los-apuntes-mobile",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    scheme: "losapuntes",
    plugins: [
      ...(config.plugins ?? []),
      "expo-router",
      "expo-secure-store",
      "expo-system-ui",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Los Apuntes usa tus fotos sólo cuando elegís una imagen para publicar un recurso.",
          cameraPermission:
            "Los Apuntes usa la cámara sólo cuando elegís fotografiar un apunte.",
          microphonePermission: false
        }
      ]
    ],
    experiments: {
      ...config.experiments,
      typedRoutes: true
    },
    ios: {
      ...config.ios,
      supportsTablet: false,
      ...(requiredPublic("LOSAPUNTES_MOBILE_IOS_BUNDLE_ID")
        ? { bundleIdentifier: requiredPublic("LOSAPUNTES_MOBILE_IOS_BUNDLE_ID") }
        : {})
    },
    android: {
      ...config.android,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      ...(requiredPublic("LOSAPUNTES_MOBILE_ANDROID_PACKAGE")
        ? { package: requiredPublic("LOSAPUNTES_MOBILE_ANDROID_PACKAGE") }
        : {})
    },
    extra: {
      ...config.extra,
      ...(easProjectId
        ? {
            eas: {
              projectId: easProjectId
            }
          }
        : {})
    }
  };
};
