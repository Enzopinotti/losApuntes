import { Text, View } from "react-native";

import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";

export default function SearchRoute() {
  return (
    <ProductSurface
      title="Buscar"
      description="Encontrá recursos, materias y personas desde una superficie nativa única."
    >
      <View style={productSurfaceStyles.card}>
        <Text style={productSurfaceStyles.cardTitle}>Búsqueda en preparación</Text>
        <Text style={productSurfaceStyles.cardCopy}>
          Esta pantalla ya forma parte de la navegación principal. Los
          resultados reales se conectarán al contrato de Search existente, con
          visibilidad y paginación decididas por el backend.
        </Text>
      </View>
    </ProductSurface>
  );
}
