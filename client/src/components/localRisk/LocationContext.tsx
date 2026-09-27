import { useState, type ReactNode } from "react";
import type { CompetitorInfo, ContextSource, FloodInfo, LocalContextResponse, ZoningInfo } from "../../../../shared/types";
import { Badge, Card, Skeleton } from "../ui";
import { IconBuilding, IconExternal, IconMapPin, IconUsers } from "../icons";
import { formatDate, formatDistance } from "./format";
import ImpactChip from "./ImpactChip";

interface Props {
  context: LocalContextResponse | null;
  loading: boolean;
  error: string | null;
  radiusLabel: string;
  showCompetitorsOnMap: boolean;
  onToggleCompetitorsOnMap: (show: boolean) => void;
}

// "Your location" section of Local Risk: zoning, flood zone, and nearby competitors.
export default function LocationContext({ context, loading, error, radiusLabel, showCompetitorsOnMap, onToggleCompetitorsOnMap }: Props) {
  if (error) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>;
  }
  if (loading && !context) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }
  if (!context) return null;
  // Flood gets a full card only when it matters (in or near a high-risk zone).
  const floodCard = context.flood.impacts.includes("flood_risk");
  return (
    <div>
      <div className={`grid gap-4 ${floodCard ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <ZoningCard z={context.zoning} />
        <CompetitorCard c={context.competitors} radiusLabel={radiusLabel} showOnMap={showCompetitorsOnMap} onToggle={onToggleCompetitorsOnMap} />
        {floodCard && <FloodCard f={context.flood} />}
      </div>
      {!floodCard && <FloodLine f={context.flood} />}
    </div>
  );
}

function Section({ icon, title, children, source }: { icon: ReactNode; title: string; children: ReactNode; source: ContextSource }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-lg text-brand-600">{icon}</span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {source.impacts.map((t) => (
          <ImpactChip key={t} tag={t} />
        ))}
      </div>
      <div className="mt-3 flex-1 text-sm text-slate-700">{children}</div>
      <SourceFooter s={source} />
    </Card>
  );
}

function SourceFooter({ s }: { s: ContextSource }) {
  if (s.status === "not_covered") return null;
  return (
    <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
      {s.status === "cached" && <p className="text-amber-700">Showing saved results from {formatDate(s.fetchedAt)}.</p>}
      {s.sourceUrl && (
        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
          Source: {s.sourceName} <IconExternal />
        </a>
      )}
    </div>
  );
}

function Unavailable({ s }: { s: ContextSource }) {
  return <p className="text-slate-500">{s.message ?? "This source is unavailable right now."}</p>;
}

function ZoningCard({ z }: { z: ZoningInfo }) {
  return (
    <Section icon={<IconBuilding />} title="Zoning" source={z}>
      {z.status === "not_covered" || z.status === "unavailable" ? (
        <Unavailable s={z} />
      ) : z.district ? (
        <>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{z.district}</p>
          {z.overlay && (
            <p className="mt-1">
              <Badge tone="blue">Overlay: {z.overlay}</Badge>
            </p>
          )}
          <p className="mt-2 text-slate-600">
            Your zoning district decides what the property can be used for. Check its rules before you expand, add a use, or
            change signs.
          </p>
          {z.detailsUrl && (
            <a href={z.detailsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
              What this district allows (official PDF) <IconExternal />
            </a>
          )}
        </>
      ) : (
        <p className="text-slate-500">{z.message ?? "No zoning district found at this address."}</p>
      )}
    </Section>
  );
}

function FloodCard({ f }: { f: FloodInfo }) {
  const tone = f.highRisk ? "red" : f.zoneDescription?.includes("0.2%") ? "amber" : "green";
  return (
    <Section icon={<IconMapPin />} title="Flood zone" source={f}>
      {f.status === "unavailable" || !f.zone ? (
        <Unavailable s={f} />
      ) : (
        <>
          <p className="flex items-center gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">Zone {f.zone}</span>
            <Badge tone={tone}>{f.highRisk ? "High risk" : tone === "amber" ? "Moderate" : "Low risk"}</Badge>
          </p>
          <p className="mt-2 text-slate-600">{f.zoneDescription}</p>
          {f.highRisk && (
            <p className="mt-2 text-slate-600">
              Lenders usually require flood insurance for federally backed loans on property in high-risk zones.
            </p>
          )}
          {!f.highRisk && f.nearbyHighRiskZones.length > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              High-risk flood zones ({f.nearbyHighRiskZones.join(", ")}) are within about {formatDistance(f.nearbyMeters)} of your address.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

// Low flood risk: one line, so the owner knows it was checked without a whole card.
function FloodLine({ f }: { f: FloodInfo }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
      <span className="inline-flex text-base text-brand-600">
        <IconMapPin />
      </span>
      {f.status === "unavailable" || !f.zone ? (
        <span>Flood zone: {f.message ?? "couldn't check right now."}</span>
      ) : (
        <span>
          <span className="font-medium text-slate-800">Flood zone {f.zone}:</span> {f.zoneDescription} No high-risk zones within
          about {formatDistance(f.nearbyMeters)}.
          {f.status === "cached" && <span className="text-amber-700"> (Saved results from {formatDate(f.fetchedAt)}.)</span>}
        </span>
      )}
      <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
        FEMA flood map <IconExternal />
      </a>
    </p>
  );
}

const PREVIEW = 5;

function CompetitorCard({ c, radiusLabel, showOnMap, onToggle }: { c: CompetitorInfo; radiusLabel: string; showOnMap: boolean; onToggle: (v: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const list = expanded ? c.items : c.items.slice(0, PREVIEW);
  return (
    <Section icon={<IconUsers />} title="Nearby competitors" source={c}>
      {c.status === "not_covered" || c.status === "unavailable" ? (
        <Unavailable s={c} />
      ) : (
        <>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{c.items.length}</p>
          <p className="text-slate-600">
            {c.label} within {radiusLabel}
          </p>
          {c.items.length > 0 && (
            <>
              <label className="mt-2 inline-flex items-center gap-1.5 text-slate-700">
                <input type="checkbox" checked={showOnMap} onChange={(e) => onToggle(e.target.checked)} />
                Show on map
              </label>
              <ul className={`mt-2 space-y-1 ${expanded ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
                {list.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-2">
                    <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="truncate hover:underline">
                      {i.name ?? <span className="italic text-slate-500">Unnamed</span>}{" "}
                      <span className="text-xs text-slate-500">{i.kind}</span>
                    </a>
                    <span className="shrink-0 text-xs text-slate-500">{formatDistance(i.distanceMeters)}</span>
                  </li>
                ))}
              </ul>
              {c.items.length > PREVIEW && (
                <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-sm font-medium text-brand-700 hover:underline">
                  {expanded ? "Show fewer" : `Show all ${c.items.length}`}
                </button>
              )}
            </>
          )}
          <p className="mt-2 text-xs text-slate-500">A count, not a sales estimate. OpenStreetMap is crowd-sourced and may be incomplete.</p>
        </>
      )}
    </Section>
  );
}
