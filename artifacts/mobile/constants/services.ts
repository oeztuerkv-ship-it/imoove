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
        text: "Ideal für planbare Fahrten: keine nachträglichen Überraschungen bei Preis oder Abrechnung.",
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
        text: "Die passende Option für kurze und mittlere Strecken im Stadtgebiet und der Region.",
      },
      {
        title: "Abrechnung nach Tarif",
        text: "Die Fahrt wird gemäß der geltenden Taxi-Tarifordnung berechnet.",
      },
    ],
  },
  {
    id: "xl",
    title: "XL",
    vehicleType: "xl",
    icon: "van-passenger",
    shortDescription: "Mehr Platz für Gruppen und zusätzliches Gepäck.",
    detail: [
      {
        title: "Mehr Sitzplätze",
        text: "XL eignet sich für Gruppenfahrten mit mehr Fahrgästen als bei Standardfahrzeugen.",
      },
      {
        title: "Komfort bei Gepäck",
        text: "Zusatzplatz für Koffer, Einkäufe oder Sporttaschen macht die Fahrt entspannter.",
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
        text: "Fahrzeuge mit Rampe oder Lift für einen sicheren Ein- und Ausstieg.",
      },
      {
        title: "Unterstützung unterwegs",
        text: "Fahrer unterstützen beim Einstieg und sorgen für einen sicheren Transport.",
      },
    ],
  },
];

export function getServiceById(id: string | null | undefined): ServiceDefinition | null {
  if (!id) return null;
  return SERVICES.find((service) => service.id === id) ?? null;
}
