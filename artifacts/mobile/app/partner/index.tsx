import { Redirect } from "expo-router";

import { usePartner } from "@/context/PartnerContext";

export default function PartnerIndex() {
  const { token, booting } = usePartner();
  if (booting) return null;
  if (token) return <Redirect href="/partner/home" />;
  return <Redirect href="/partner/login" />;
}
