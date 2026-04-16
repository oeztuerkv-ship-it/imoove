import { type VehicleType } from "@/context/RideContext";

export type ServiceId = "standard" | "xl" | "wheelchair";

export interface ServiceDetailItem {
  title: string;
  text: string;
}

export interface ServiceDefinition {
  id: ServiceId;
  title: string;
  vehicleType: VehicleType;
  icon: "car-sports" | "van-passenger" | "wheelchair-accessibility";
  detail: ServiceDetailItem[];
}

export const SERVICES: ServiceDefinition[] = [
  {
    id: "standard",
    title: "Onroda",
    vehicleType: "onroda",
    icon: "car-sports",
    detail: [
      {
        title: "Fahrzeug finden",
        text: "Sichere dir schnell ein Standard-Taxi in deiner Naehe. Ideal fuer Alltagsfahrten, kurze Strecken und spontane Buchungen.",
      },
      {
        title: "Fahrt verwalten",
        text: "Verfolge deine Fahrt in Echtzeit, aendere Details oder storniere flexibel direkt in der App.",
      },
    ],
  },
  {
    id: "xl",
    title: "XL",
    vehicleType: "xl",
    icon: "van-passenger",
    detail: [
      {
        title: "Grossraumfahrzeug finden",
        text: "Perfekt fuer Gruppen, Familien oder viel Gepaeck. Mehr Platz und Komfort bei gleicher einfacher Buchung.",
      },
      {
        title: "Extras verwalten",
        text: "Waehle Zusatzoptionen wie Kindersitze oder zusaetzliche Gepaeckhilfe.",
      },
    ],
  },
  {
    id: "wheelchair",
    title: "Rollstuhl",
    vehicleType: "wheelchair",
    icon: "wheelchair-accessibility",
    detail: [
      {
        title: "Barrierefreie Fahrt",
        text: "Fahrzeuge mit Rampe oder Lift fuer Rollstuhlfahrer. Sicherer und komfortabler Transport.",
      },
      {
        title: "Unterstuetzung buchen",
        text: "Fahrer helfen beim Ein- und Ausstieg und sichern den Rollstuhl fachgerecht.",
      },
    ],
  },
];

export function getServiceById(id: string | null | undefined): ServiceDefinition | null {
  if (!id) return null;
  return SERVICES.find((service) => service.id === id) ?? null;
}
