import { queryArcgis, sqlDate, type ArcgisFeature } from "./arcgis.js";
import { daysAgo } from "./util.js";

// Baltimore City "Housing and Building Permits 2019-Present" (Open Baltimore).
// Fields verified 2026-09-26 via ?f=json. Native WKID 2248; we always query in 4326.
export const BALTIMORE_CITY = {
  id: "baltimore_city_permits",
  name: "Baltimore City building permits",
  layerUrl: "https://baltegis.baltimorecity.gov/mapping/rest/services/Housing/DHCD_Open_Baltimore_Datasets/FeatureServer/3",
  datasetUrl: "https://data.baltimorecity.gov/datasets/189e6d1c65df4e13b38c0027cee574f6",
} as const;

export interface CityPermit {
  OBJECTID: number;
  CaseNumber: string | null; // prefix: BCCM commercial, BRCM residential, BDEM demolition
  PermitName: string | null; // free text chosen by the applicant
  Description: string | null;
  Address: string | null;
  IssuedDate: number | null;
  ExpirationDate: number | null;
  ExistingUse: string | null;
  ProposedUse: string | null;
  Cost: number | null;
  Neighborhood: string | null;
}

// Permits issued in the last year that haven't expired yet.
export function fetchBaltimoreCityPermits(lat: number, lng: number, radiusMeters: number): Promise<ArcgisFeature<CityPermit>[]> {
  const now = new Date();
  return queryArcgis<CityPermit>(BALTIMORE_CITY.layerUrl, {
    where: `IssuedDate >= ${sqlDate(daysAgo(365, now))} AND (ExpirationDate IS NULL OR ExpirationDate >= ${sqlDate(now)})`,
    outFields: [
      "OBJECTID", "CaseNumber", "PermitName", "Description", "Address", "IssuedDate",
      "ExpirationDate", "ExistingUse", "ProposedUse", "Cost", "Neighborhood",
    ],
    orderByFields: "IssuedDate DESC",
    near: { lat, lng, radiusMeters },
  });
}
