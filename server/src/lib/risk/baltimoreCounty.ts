import { queryArcgis, sqlDate, type ArcgisFeature } from "./arcgis.js";
import { daysAgo } from "./util.js";

// Baltimore County "Permits" (Cityworks), published via opendata.baltimorecountymd.gov.
// Fields verified 2026-09-26 via ?f=json.
export const BALTIMORE_COUNTY = {
  id: "baltimore_county_permits",
  name: "Baltimore County permits",
  layerUrl: "https://bcgisdata.baltimorecountymd.gov/arcgis/rest/services/DevelopmentManagement/ActiveDevelopment/MapServer/4",
  datasetUrl: "https://opendata.baltimorecountymd.gov/datasets/cfd6eb593b524875a80e3c45e4575fa9",
} as const;

export interface CountyPermit {
  OBJECTID: number;
  PERMITNO: string | null;
  APPL_DATE: number | null;
  ISSDATE: number | null;
  P_ADDRESS: string | null;
  DESCRIPTION_TYPE: string | null; // e.g. "Comm. Permit - Grading"
  DESC_WORK: string | null;
  PRO_USE: string | null;
  EST_COST: string | null;
  STATUS: string | null; // OPEN, ISSUE, CLOSED, EXPIRED, CANCELLED
  TYPEDESCRIPTION: string | null; // e.g. "Commercial Razing", "Residential New"
  SUBTYPE_DESCRIPTION: string | null; // e.g. "New Dwelling", "Grading", "Fence"
}

// Permits applied for or issued in the last year that are still open or issued.
export function fetchBaltimoreCountyPermits(lat: number, lng: number, radiusMeters: number): Promise<ArcgisFeature<CountyPermit>[]> {
  const since = sqlDate(daysAgo(365));
  return queryArcgis<CountyPermit>(BALTIMORE_COUNTY.layerUrl, {
    where: `(ISSDATE >= ${since} OR APPL_DATE >= ${since}) AND STATUS IN ('OPEN', 'ISSUE')`,
    outFields: [
      "OBJECTID", "PERMITNO", "APPL_DATE", "ISSDATE", "P_ADDRESS", "DESCRIPTION_TYPE", "DESC_WORK",
      "PRO_USE", "EST_COST", "STATUS", "TYPEDESCRIPTION", "SUBTYPE_DESCRIPTION",
    ],
    orderByFields: "OBJECTID",
    near: { lat, lng, radiusMeters },
  });
}
