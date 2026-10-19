import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PublicConfig } from "./api/client";
import { Shell } from "./components/Shell";
import { useLiveEvents } from "./hooks/useLiveEvents";
import { ControlRoomPage } from "./pages/ControlRoomPage";
import { InsightsPage } from "./pages/InsightsPage";
import { LandingPage } from "./pages/LandingPage";
import { CartPage, CheckoutPage, ProductPage, ShopPage, SuccessPage } from "./pages/ShopPages";

const queryClient = new QueryClient();

export function App({ config }: { config: PublicConfig }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Live />
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<LandingPage />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="shop/:sku" element={<ProductPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage clientId={config.paypalClientId} dryRun={config.dryRun} />} />
            <Route path="checkout/success" element={<SuccessPage />} />
            <Route path="control" element={<ControlRoomPage dryRun={config.dryRun} />} />
            <Route
              path="insights"
              element={
                <InsightsPage
                  licenseKey={config.agStudioLicenseKey}
                  studioAiEnabled={config.studioAiEnabled}
                  studioAiModels={config.studioAiModels}
                />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Live() {
  useLiveEvents();
  return null;
}
