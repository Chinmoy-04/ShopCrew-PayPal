import { useState } from "react";
import type { Product } from "../api/client";

const images: Record<string, string> = {
  CEDAR: "cedar-scene", LINEN: "linen-scene", FIG: "fig-scene", NIGHT: "night-scene", HONEY: "honey-scene", CITRUS: "citrus-scene",
};

const scenes: Record<string, string> = {
  CEDAR: "on a cedar stump in a shadowy wood cabin, with a wisp of smoke",
  LINEN: "on a coastal windowsill beside billowing white linen",
  FIG: "on a green garden table beneath sunlit fig leaves",
  NIGHT: "on a rain-dark city ledge with jasmine and warm market lights",
  HONEY: "on a walnut desk with honeycomb and dried tobacco in amber light",
  CITRUS: "on a terracotta pedestal in a sunlit orange grove",
};

/** Static presentation assets only: prices, stock and catalog identity stay API-owned. */
export function ProductImage({ product, hero = false }: { product: Product; hero?: boolean }) {
  const [failed, setFailed] = useState(false);
  const asset = images[product.sku];
  return <div className={hero ? "product-hero-swatch product-photo" : "product-card__swatch product-photo"}
    style={{ background: `linear-gradient(165deg, ${product.hue} 0%, color-mix(in srgb, ${product.hue} 55%, #1c1915) 100%)` }}>
    {asset && !failed ? <img
      src={`/images/hearth-wick/${asset}.webp?v=labels-1`}
      srcSet={`/images/hearth-wick/${asset}-480.webp?v=labels-1 480w, /images/hearth-wick/${asset}.webp?v=labels-1 960w`}
      sizes={hero ? "(max-width: 800px) calc(100vw - 32px), 560px" : "(max-width: 800px) 45vw, 380px"}
      width={960} height={960} alt={hero ? `${product.name} candle in an ivory ceramic vessel ${scenes[product.sku] || ""}`.trim() : ""}
      loading={hero ? "eager" : "lazy"} fetchPriority={hero ? "high" : "auto"}
      onError={() => setFailed(true)}
    /> : <span className="swatch-fallback">{product.name}</span>}
  </div>;
}
