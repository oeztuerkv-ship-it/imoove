import type { PartnerType } from "../../db/partnerRegistrationRequestsData";
import { isPartnerType } from "../../db/partnerRegistrationRequestsData";
import type { PartnerRegistrationPolicy } from "./types";
import { taxiPartnerRegistrationPolicy } from "./taxiPartnerRegistrationPolicy";
import { hotelPartnerRegistrationPolicy } from "./hotelPartnerRegistrationPolicy";
import { insurerPartnerRegistrationPolicy } from "./insurerPartnerRegistrationPolicy";
import {
  carePartnerRegistrationPolicy,
  medicalPartnerRegistrationPolicy,
} from "./medicalPartnerRegistrationPolicy";
import {
  businessPartnerRegistrationPolicy,
  otherPartnerRegistrationPolicy,
  voucherPartnerRegistrationPolicy,
} from "./generalPartnerRegistrationPolicy";

const POLICIES: Record<PartnerType, PartnerRegistrationPolicy> = {
  taxi: taxiPartnerRegistrationPolicy,
  hotel: hotelPartnerRegistrationPolicy,
  insurance: insurerPartnerRegistrationPolicy,
  medical: medicalPartnerRegistrationPolicy,
  care: carePartnerRegistrationPolicy,
  business: businessPartnerRegistrationPolicy,
  voucher_partner: voucherPartnerRegistrationPolicy,
  other: otherPartnerRegistrationPolicy,
};

export function getPartnerRegistrationPolicy(partnerType: string): PartnerRegistrationPolicy | null {
  if (!isPartnerType(partnerType)) return null;
  return POLICIES[partnerType];
}

export type { PartnerRegistrationPolicy, PartnerRegistrationRequestRow } from "./types";
