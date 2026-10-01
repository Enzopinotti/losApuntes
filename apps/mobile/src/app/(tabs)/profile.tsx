import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

export default function ProfileRoute() {
  const { snapshot, logout } = useSession();

  if (snapshot.kind !== "authenticated") {
    return <Redirect href="/sign-in" />;
  }

  return (
    <ProductSurface
      title="Perfil"
      description="Tu identidad en Los Apuntes, separada de las credenciales y del contexto académico autoritativo."
    >
      <View style={productSurfaceStyles.card}>
        <Text style={productSurfaceStyles.cardTitle}>Cuenta actual</Text>
        <Text style={productSurfaceStyles.cardCopy}>{snapshot.user.email}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        onPress={() => void logout()}
        style={styles.logout}
      >
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  logout: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  logoutText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
