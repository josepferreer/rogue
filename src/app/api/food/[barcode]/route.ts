import type { NextRequest } from "next/server";
import { fetchOffProduct } from "@/lib/food/openfoodfacts";

// Proxy a Open Food Facts: consulta un producto por codigo de barras desde el
// servidor (control del User-Agent, sin exponer nada al cliente).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;
  const product = await fetchOffProduct(barcode);
  if (!product) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ product });
}
