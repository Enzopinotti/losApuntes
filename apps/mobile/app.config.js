module.exports = ({ config }) => {
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || null;
  const iosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || null;
  const iosUrlScheme =
    process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim() || null;
  const plugins = [...(config.plugins ?? [])];

  if (iosClientId && iosUrlScheme) {
    plugins.push(["react-native-nitro-google-signin", { iosUrlScheme }]);
  }

  return {
    ...config,
    plugins,
    extra: {
      ...config.extra,
      googleMobile: {
        ...(webClientId ? { webClientId } : {}),
        ...(iosClientId ? { iosClientId } : {}),
        iosUrlSchemeConfigured: Boolean(iosUrlScheme),
      },
    },
  };
};
