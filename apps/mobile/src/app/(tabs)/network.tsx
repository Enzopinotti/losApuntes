import { Text, View } from "react-native";

import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";

export default function NetworkRoute() {
  return (
    <ProductSurface
      title="Red"
      description="Personas, conexiones y colaboración académica en un lugar propio."
    >
      <View style={productSurfaceStyles.card}>
        <Text style={productSurfaceStyles.cardTitle}>Tu red universitaria</Text>
        <Text style={productSurfaceStyles.cardCopy}>
          Follow, conexiones y Q&amp;A se conectarán acá reutilizando las
          relaciones y permisos que ya decide el backend.
        </Text>
      </View>
    </ProductSurface>
  );
}
