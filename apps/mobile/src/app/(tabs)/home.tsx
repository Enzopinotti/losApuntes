import { AcademicContextCard } from "@/features/academic/academic-context-card";
import { ProductSurface } from "@/features/navigation/product-surface";

export default function HomeRoute() {
  return (
    <ProductSurface
      title="Inicio"
      description="Tu punto de entrada a Los Apuntes, con el contexto académico revalidado por el servidor antes de alimentar las superficies de producto."
    >
      <AcademicContextCard />
    </ProductSurface>
  );
}
