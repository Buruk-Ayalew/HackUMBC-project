import { politeFetchJson } from "../http.js";

// Minimal ArcGIS REST query client: point + radius search, paginated at 1,000.

export interface ArcgisPoint {
  x: number;
  y: number;
}

export interface ArcgisPolygon {
  rings: [number, number][][]; // [lng, lat] pairs when outSR=4326
}

export interface ArcgisFeature<A, G = ArcgisPoint> {
  attributes: A;
  geometry?: G;
}

interface ArcgisQueryResponse<A, G> {
  features?: ArcgisFeature<A, G>[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

export interface ArcgisQuery {
  where: string;
  outFields: string[];
  orderByFields?: string;
  near?: { lat: number; lng: number; radiusMeters: number }; // radiusMeters 0 = features containing the point
  returnGeometry?: boolean; // default true
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 5; // hard stop so one dense area can't hammer a government server

export async function queryArcgis<A, G = ArcgisPoint>(layerUrl: string, q: ArcgisQuery): Promise<ArcgisFeature<A, G>[]> {
  const out: ArcgisFeature<A, G>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: q.where,
      outFields: q.outFields.join(","),
      returnGeometry: String(q.returnGeometry ?? true),
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
      if (q.near.radiusMeters > 0) {
        params.set("distance", String(Math.round(q.near.radiusMeters)));
        params.set("units", "esriSRUnit_Meter");
      }
    }
    const res = await politeFetchJson<ArcgisQueryResponse<A, G>>(`${layerUrl}/query?${params}`, 30000);
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
