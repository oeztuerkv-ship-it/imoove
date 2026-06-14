export type AppLocale = "de" | "en" | "tr";

export const SUPPORTED_LOCALES: AppLocale[] = ["de", "en", "tr"];

export const DEFAULT_LOCALE: AppLocale = "de";

export const LOCALE_STORAGE_KEY = "@Onroda_app_locale";

export type TranslationTree = {
  common: {
    cancel: string;
    save: string;
    saved: string;
    error: string;
    hint: string;
    logout: string;
    comingSoon: string;
    ok: string;
  };
  tabs: {
    start: string;
    rides: string;
    book: string;
    places: string;
    account: string;
  };
  language: {
    title: string;
    choose: string;
    names: { de: string; en: string; tr: string };
  };
  profile: {
    myAccount: string;
    profile: string;
    patientProfile: string;
    paymentMethods: string;
    transactionHistory: string;
    billingAddress: string;
    language: string;
    helpSupport: string;
    logout: string;
    logoutConfirmTitle: string;
    logoutConfirmMessage: string;
    savedProfile: string;
    savedBilling: string;
    savedPatient: string;
    appleLoginSoon: string;
  };
  wallet: {
    title: string;
    paymentMethods: string;
    security: string;
    secureTitle: string;
    secureBody: string;
    cash: string;
    cashSublabel: string;
    cashAlertTitle: string;
    cashAlertMessage: string;
    paypal: string;
    paypalSublabel: string;
    paypalSoon: string;
    paypalAlertMessage: string;
    card: string;
    cardSublabel: string;
    cardSoon: string;
    cardAlertMessage: string;
    voucher: string;
    voucherSublabel: string;
    voucherAlertTitle: string;
    voucherAlertMessage: string;
    transport: string;
    transportSublabel: string;
    transportAlertMessage: string;
    billingMissing: string;
    billingMissingMessage: string;
  };
  alerts: {
    saved: string;
    savedProfile: string;
    savedBilling: string;
    savedPatient: string;
  };
  driver: {
    payment: {
      cash: string;
      cashFull: string;
      card: string;
      cardFull: string;
      paypal: string;
      app: string;
      voucher: string;
      voucherFull: string;
      invoice: string;
      exempt: string;
      copay: string;
      codeRide: string;
      insurance: string;
      unknown: string;
    };
    offer: {
      instantRide: string;
      distanceLabel: string;
      pickup: string;
      destination: string;
      destinationLocked: string;
      reject: string;
      release: string;
      releaseHint: string;
      accept: string;
      acceptHint: string;
      seconds: string;
      taxiRide: string;
      medicalRide: string;
      newRideBanner: string;
      timeSuffix: string;
    };
    scheduled: {
      reject: string;
      accept: string;
      cancel: string;
      activate: string;
    };
  };
};
