import { Text, View } from "react-native";

import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";

export default function HomeRoute() {
  return (
    <ProductSurface
      title="Inicio"
      description="Tu punto de entrada a Los Apuntes, preparado para combinar contexto académico, recursos y actividad sin duplicar autoridad del servidor."
    >
      <View style={productSurfaceStyles.card}>
        <Text style={productSurfaceStyles.cardTitle}>Contexto académico</Text>
        <Text style={productSurfaceStyles.cardCopy}>
          La selección y revalidación de universidad, carrera y materias se
          conectará en el próximo slice. Esta navegación no inventa un contexto
          local mientras tanto.
        </Text>
      </View>
    </ProductSurface>
  );
}
