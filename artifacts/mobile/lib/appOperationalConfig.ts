/**
 * @deprecated nutze `lib/appConfig` — re-export für alte Import-Pfade.
 */
export type { OnrodaServiceRegion as AppServiceRegion } from "./appConfig";
export {
  clientCheckServiceArea,
  fetchAppConfig as fetchAppOperationalConfig,
  getDefaultAppConfig,
  getOutOfServiceDe as getOutOfServiceAreaDe,
  userFacingBookingErrorMessage,
  validateServiceAreaForBooking,
} from "./appConfig";
