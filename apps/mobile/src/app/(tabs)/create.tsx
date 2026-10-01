import { Text, View } from "react-native";

import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";

export default function CreateRoute() {
  return (
    <ProductSurface
      title="Crear"
      description="El acceso principal para aportar recursos y, más adelante, otras contribuciones soportadas."
    >
      <View style={productSurfaceStyles.card}>
        <Text style={productSurfaceStyles.cardTitle}>Publicación nativa</Text>
        <Text style={productSurfaceStyles.cardCopy}>
          El flujo de archivos, cámara y compartir se incorporará sobre los
          upload intents existentes, con progreso, cancelación y reintentos
          seguros.
        </Text>
      </View>
    </ProductSurface>
  );
}
