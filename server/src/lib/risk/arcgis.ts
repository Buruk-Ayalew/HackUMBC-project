import { politeFetchJson } from "../http.js";

// Minimal ArcGIS REST query client: point + radius search, paginated at 1,000.

export interface ArcgisFeature<A> {
  attributes: A;
  geometry?: { x: number; y: number };
}

interface ArcgisQueryResponse<A> {
  features?: ArcgisFeature<A>[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

export interface ArcgisQuery {
  where: string;
  outFields: string[];
  orderByFields?: string;
  near?: { lat: number; lng: number; radiusMeters: number };
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 5; // hard stop so one dense area can't hammer a government server

export async function queryArcgis<A>(layerUrl: string, q: ArcgisQuery): Promise<ArcgisFeature<A>[]> {
  const out: ArcgisFeature<A>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: q.where,
      outFields: q.outFields.join(","),
      returnGeometry: "true",
      outSR: "4326",
      resultOffset: String(page * PAGE_SIZE),
      resultRecordCount: String(PAGE_SIZE),
      f: "json",
    });
    if (q.orderByFields) params.set("orderByFields", q.orderByFields);
    if (q.near) {
      params.set("geometry", `${q.near.lng},${q.near.lat}`);
      params.set("geometryType", "esriGeometryPoint");
      params.set("inSR", "4326");
      params.set("spatialRel", "esriSpatialRelIntersects");
      params.set("distance", String(Math.round(q.near.radiusMeters)));
      params.set("units", "esriSRUnit_Meter");
    }
    const res = await politeFetchJson<ArcgisQueryResponse<A>>(`${layerUrl}/query?${params}`, 30000);
    // ArcGIS reports query errors with HTTP 200 and an error body.
    if (res.error) throw new Error(`ArcGIS error ${res.error.code}: ${res.error.message}`);
    const features = res.features ?? [];
    out.push(...features);
    if (!res.exceededTransferLimit || features.length === 0) break;
  }
  return out;
}

// ArcGIS SQL date literal, e.g. DATE '2026-09-26'.
export function sqlDate(d: Date): string {
  return `DATE '${d.toISOString().slice(0, 10)}'`;
}
