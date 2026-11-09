import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PublicConfig } from "./api/client";
import { RouteSkeleton } from "./components/RouteSkeleton";
import { Shell } from "./components/Shell";
import { useLiveEvents } from "./hooks/useLiveEvents";
import { LandingPage } from "./pages/LandingPage";
import { CartPage, CheckoutPage, ProductPage, ShopPage, SuccessPage } from "./pages/ShopPages";

const ControlRoomPage = lazy(() =>
  import("./pages/ControlRoomPage").then((m) => ({ default: m.ControlRoomPage })),
);
const InsightsPage = lazy(() =>
  import("./pages/InsightsPage").then((m) => ({ default: m.InsightsPage })),
);

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
            <Route
              path="checkout"
              element={
                <CheckoutPage
                  clientId={config.paypalClientId}
                  dryRun={config.dryRun}
                  demoBuyerHint={config.demoBuyerHint}
                  demoBuyerEmail={config.demoBuyerEmail}
                />
              }
            />
            <Route path="checkout/success" element={<SuccessPage />} />
            <Route
              path="control"
              element={
                <Suspense fallback={<RouteSkeleton label="control room" />}>
                  <ControlRoomPage
                    dryRun={config.dryRun}
                    agGridLicenseKey={config.agGridLicenseKey}
                    demoPublicReset={config.demoPublicReset}
                  />
                </Suspense>
              }
            />
            <Route
              path="insights"
              element={
                <Suspense fallback={<RouteSkeleton label="Insights" />}>
                  <InsightsPage
                    licenseKey={config.agStudioLicenseKey}
                    studioAiEnabled={config.studioAiEnabled}
                    studioAiModels={config.studioAiModels}
                  />
                </Suspense>
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
