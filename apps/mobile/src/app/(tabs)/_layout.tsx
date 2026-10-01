import { Redirect, Tabs } from "expo-router";

import {
  PRODUCT_TAB_LABELS,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { useSession } from "@/features/session/session-provider";

export default function ProductTabsLayout() {
  const { snapshot } = useSession();

  if (snapshot.kind !== "authenticated") {
    return <Redirect href="/sign-in" />;
  }

  const authorityKey = navigationAuthorityKey(
    snapshot.user.id,
    snapshot.session.id,
  );

  return (
    <Tabs
      key={authorityKey}
      initialRouteName="home"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: PRODUCT_TAB_LABELS.home,
          tabBarAccessibilityLabel: "Inicio",
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: PRODUCT_TAB_LABELS.search,
          tabBarAccessibilityLabel: "Buscar",
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: PRODUCT_TAB_LABELS.create,
          tabBarAccessibilityLabel: "Crear",
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: PRODUCT_TAB_LABELS.network,
          tabBarAccessibilityLabel: "Red",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: PRODUCT_TAB_LABELS.profile,
          tabBarAccessibilityLabel: "Perfil",
        }}
      />
    </Tabs>
  );
}
