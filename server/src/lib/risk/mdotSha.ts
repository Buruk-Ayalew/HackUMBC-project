import { queryArcgis, type ArcgisFeature } from "./arcgis.js";

// Statewide sources, so every Maryland address gets some coverage. Both are small
// enough (a few hundred active records) to fetch statewide once per refresh and
// filter by distance locally. Fields verified 2026-09-26 via ?f=json.

export const MDOT_SHA_PROJECTS = {
  id: "mdot_sha_projects",
  name: "MDOT SHA state road projects",
  layerUrl: "https://services.arcgis.com/njFNhDsUCentVYJW/arcgis/rest/services/MDOT_SHA_Projects_Public/FeatureServer/0",
  datasetUrl: "https://data.imap.maryland.gov/datasets/881b5676128f44b484541cc7a3f62b4c",
} as const;

export const MD_ROAD_CLOSURES = {
  id: "md_road_closures",
  name: "Maryland reported road closures",
  activeUrl: "https://mdgeodata.md.gov/appdata/rest/services/SHA_RoadClosure/RoadClosureActive/MapServer/0",
  plannedUrl: "https://mdgeodata.md.gov/appdata/rest/services/SHA_RoadClosure/RoadClosurePlanned/MapServer/0",
  activeDatasetUrl: "https://data.imap.maryland.gov/datasets/db191c9dd50b47789193759368a4bc5d",
  plannedDatasetUrl: "https://data.imap.maryland.gov/datasets/6bc982d837cc4bacb2b655c0abceb11f",
} as const;

export interface ShaProject {
  OBJECTID: number;
  Project_Name: string | null;
  Location: string | null;
  County: string | null;
  Work_Type: string | null;
  Phase: string | null; // Planning, Design, Construction, N/A
  Project_Status: string | null; // In Progress, On Hold, Complete, Canceled
  Estimated_Start_Season: string | null;
  Estimated_Completion_Season: string | null;
  Estimated_Project_Start_Year: number | null;
  Estimated_Project_Completion_Ye: number | null;
  What_to_Expect: string | null;
  Project_Portal_URL: string | null;
}

export interface RoadClosure {
  OBJECTID: number;
  RC_GUID: string | null;
  ClosureStart: number | null;
  ClosureEnd: number | null;
  ClosureType: string | null; // "Closed", "Limited Public Access", ...
  RoadName: string | null;
  CrossStreet1: string | null;
  CrossStreet2: string | null;
  ClosureSummary: string | null;
  Jurisdiction: string | null;
  typeSummary: string | null; // "Construction", "Special Event", ...
  Comments: string | null;
}

export function fetchShaProjects(): Promise<ArcgisFeature<ShaProject>[]> {
  return queryArcgis<ShaProject>(MDOT_SHA_PROJECTS.layerUrl, {
    where: "Project_Status IN ('In Progress', 'On Hold')",
    outFields: [
      "OBJECTID", "Project_Name", "Location", "County", "Work_Type", "Phase", "Project_Status",
      "Estimated_Start_Season", "Estimated_Completion_Season", "Estimated_Project_Start_Year",
      "Estimated_Project_Completion_Ye", "What_to_Expect", "Project_Portal_URL",
    ],
    orderByFields: "OBJECTID",
  });
}

const CLOSURE_FIELDS = [
  "OBJECTID", "RC_GUID", "ClosureStart", "ClosureEnd", "ClosureType", "RoadName", "CrossStreet1",
  "CrossStreet2", "ClosureSummary", "Jurisdiction", "typeSummary", "Comments",
];

export async function fetchRoadClosures(): Promise<{
  active: ArcgisFeature<RoadClosure>[];
  planned: ArcgisFeature<RoadClosure>[];
}> {
  // Sequential on purpose: same host, and politeFetch spaces them out anyway.
  const active = await queryArcgis<RoadClosure>(MD_ROAD_CLOSURES.activeUrl, { where: "1=1", outFields: CLOSURE_FIELDS });
  const planned = await queryArcgis<RoadClosure>(MD_ROAD_CLOSURES.plannedUrl, { where: "1=1", outFields: CLOSURE_FIELDS });
  return { active, planned };
}
