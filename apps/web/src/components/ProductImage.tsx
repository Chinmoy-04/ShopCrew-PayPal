import { useState } from "react";
import type { Product } from "../api/client";

const images: Record<string, string> = {
  CEDAR: "cedar", LINEN: "linen", FIG: "fig", NIGHT: "night", HONEY: "honey", CITRUS: "citrus",
};

/** Static presentation assets only: prices, stock and catalog identity stay API-owned. */
export function ProductImage({ product, hero = false }: { product: Product; hero?: boolean }) {
  const [failed, setFailed] = useState(false);
  const asset = images[product.sku];
  return <div className={hero ? "product-hero-swatch product-photo" : "product-card__swatch product-photo"}
    style={{ background: `linear-gradient(165deg, ${product.hue} 0%, color-mix(in srgb, ${product.hue} 55%, #1c1915) 100%)` }}>
    {asset && !failed ? <img
      src={`/images/hearth-wick/${asset}.webp`}
      srcSet={`/images/hearth-wick/${asset}-480.webp 480w, /images/hearth-wick/${asset}.webp 960w`}
      sizes={hero ? "(max-width: 800px) calc(100vw - 32px), 560px" : "(max-width: 800px) 45vw, 380px"}
      width={960} height={960} alt={hero ? `${product.name} candle in an ivory ceramic vessel` : ""}
      loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : "auto"}
      onError={() => setFailed(true)}
    /> : <span className="swatch-fallback">{product.name}</span>}
  </div>;
}
