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
    shortDescription: "Fixpreis mit klarer Preiszusage vor Fahrtbeginn.",
    detail: [
      {
        title: "Festpreis vor Fahrtstart",
        text: "Der Fahrpreis wird vor Fahrtbeginn verbindlich festgelegt. So wissen Sie vorab, was die Fahrt kostet.",
      },
      {
        title: "Planbar und transparent",
        text: "Ideal fuer planbare Fahrten: keine nachtraeglichen Ueberraschungen bei Preis oder Abrechnung.",
      },
    ],
  },
  {
    id: "standard",
    title: "Taxi",
    vehicleType: "standard",
    icon: "car-sports",
    shortDescription: "Klassische Taxifahrt nach lokalem Tarif.",
    detail: [
      {
        title: "Schnell im Alltag",
        text: "Die passende Option fuer kurze und mittlere Strecken im Stadtgebiet und der Region.",
      },
      {
        title: "Abrechnung nach Tarif",
        text: "Die Fahrt wird gemaess der geltenden Taxi-Tarifordnung berechnet.",
      },
    ],
  },
  {
    id: "xl",
    title: "XL",
    vehicleType: "xl",
    icon: "van-passenger",
    shortDescription: "Mehr Platz fuer Gruppen und zusaetzliches Gepaeck.",
    detail: [
      {
        title: "Mehr Sitzplaetze",
        text: "XL eignet sich fuer Gruppenfahrten mit mehr Fahrgaesten als bei Standardfahrzeugen.",
      },
      {
        title: "Komfort bei Gepaeck",
        text: "Zusatzplatz fuer Koffer, Einkaeufe oder Sporttaschen macht die Fahrt entspannter.",
      },
    ],
  },
  {
    id: "wheelchair",
    title: "Rollstuhl",
    vehicleType: "wheelchair",
    icon: "wheelchair-accessibility",
    shortDescription: "Barrierefreie Fahrt mit passender Ausstattung.",
    detail: [
      {
        title: "Barrierefreie Ausstattung",
        text: "Fahrzeuge mit Rampe oder Lift fuer einen sicheren Ein- und Ausstieg.",
      },
      {
        title: "Unterstuetzung unterwegs",
        text: "Fahrer unterstuetzen beim Einstieg und sorgen fuer einen sicheren Transport.",
      },
    ],
  },
];

export function getServiceById(id: string | null | undefined): ServiceDefinition | null {
  if (!id) return null;
  return SERVICES.find((service) => service.id === id) ?? null;
}
