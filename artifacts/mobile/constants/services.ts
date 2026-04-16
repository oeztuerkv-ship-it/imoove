import { type VehicleType } from "@/context/RideContext";

export type ServiceId = "onroda" | "standard" | "xl" | "wheelchair";

export interface ServiceDetailItem {
  title: string;
  text: string;
}

export interface ServiceDefinition {
  id: ServiceId;
  title: string;
  vehicleType: VehicleType;
  icon: "car-sports" | "van-passenger" | "wheelchair-accessibility";
  shortDescription: string;
  detail: ServiceDetailItem[];
}

export const SERVICES: ServiceDefinition[] = [
  {
    id: "onroda",
    title: "Onroda",
    vehicleType: "onroda",
    icon: "car-sports",
    shortDescription: "Fixpreis-Garantie. Der angezeigte Fahrpreis bleibt unveraendert - volle Transparenz ohne Ueberraschungen.",
    detail: [
      {
        title: "Kurzbeschreibung",
        text: "Fixpreis-Garantie. Der angezeigte Fahrpreis bleibt unveraendert - volle Transparenz ohne Ueberraschungen.",
      },
    ],
  },
  {
    id: "standard",
    title: "Standard Taxi",
    vehicleType: "standard",
    icon: "car-sports",
    shortDescription: "Klassisches Taxi fuer den Alltag. Schnell verfuegbar und zuverlaessig ans Ziel.",
    detail: [
      {
        title: "Kurzbeschreibung",
        text: "Klassisches Taxi fuer den Alltag. Schnell verfuegbar und zuverlaessig ans Ziel.",
      },
    ],
  },
  {
    id: "xl",
    title: "XL",
    vehicleType: "xl",
    icon: "van-passenger",
    shortDescription: "Mehr Platz fuer Gruppen und Gepaeck. Komfortabel unterwegs mit extra Raum.",
    detail: [
      {
        title: "Kurzbeschreibung",
        text: "Mehr Platz fuer Gruppen und Gepaeck. Komfortabel unterwegs mit extra Raum.",
      },
    ],
  },
  {
    id: "wheelchair",
    title: "Rollstuhl",
    vehicleType: "wheelchair",
    icon: "wheelchair-accessibility",
    shortDescription: "Barrierefreie Fahrzeuge mit Rampe oder Lift. Sicher und zuverlaessig ans Ziel.",
    detail: [
      {
        title: "Kurzbeschreibung",
        text: "Barrierefreie Fahrzeuge mit Rampe oder Lift. Sicher und zuverlaessig ans Ziel.",
      },
    ],
  },
];

export function getServiceById(id: string | null | undefined): ServiceDefinition | null {
  if (!id) return null;
  return SERVICES.find((service) => service.id === id) ?? null;
}
