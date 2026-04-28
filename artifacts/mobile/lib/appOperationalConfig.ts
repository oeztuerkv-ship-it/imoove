/**
 * @deprecated nutze `lib/appConfig` — re-export für alte Import-Pfade.
 */
export type { OnrodaServiceRegion as AppServiceRegion } from "./appConfig";
export {
  clientCheckServiceArea,
  fetchAppConfig as fetchAppOperationalConfig,
  getDefaultAppConfig,
  getOutOfServiceDe as getOutOfServiceAreaDe,
  MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
  MESSAGE_COMPLETE_ADDRESS_REQUIRED_DE,
  userFacingBookingErrorMessage,
  validateAddressCompletenessForBooking,
  validateServiceAreaForBooking,
} from "./appConfig";
