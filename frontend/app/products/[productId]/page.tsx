import { Suspense } from "react";
import ProductDetailsClient from "./ProductDetailsClient";

type ProductDetailsPageProps = {
  params: Promise<{
    productId: string;
  }>;
};

function ProductDetailsLoading() {
  return (
    <main className="min-h-screen bg-[#f7f7f8] p-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-zinc-200" />
        <div className="mt-6 h-48 rounded-2xl bg-zinc-200" />
      </div>
    </main>
  );
}

async function ProductDetailsContent({ params }: ProductDetailsPageProps) {
  const { productId } = await params;

  return <ProductDetailsClient productId={productId} />;
}

export default function ProductDetailsPage({
  params,
}: ProductDetailsPageProps) {
  return (
    <Suspense fallback={<ProductDetailsLoading />}>
      <ProductDetailsContent params={params} />
    </Suspense>
  );
}
