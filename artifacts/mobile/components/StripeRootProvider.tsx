import { StripeProvider } from "@stripe/stripe-react-native";
import React from "react";

import { STRIPE_PUBLISHABLE_KEY } from "@/constants/stripe";

type Props = {
  children: React.ReactNode;
};

/** Stripe nur aktiv, wenn Publishable Key gesetzt ist (sonst Children unverändert). */
export function StripeRootProvider({ children }: Props) {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} merchantIdentifier="merchant.com.vedat.mobile">
      <>{children}</>
    </StripeProvider>
  );
}
