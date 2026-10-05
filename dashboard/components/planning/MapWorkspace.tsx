"use client";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import * as Popover from "@radix-ui/react-popover";
import PlaceLocationFields from "./PlaceLocationFields";
import MapDataExplorer, {
  MapDataLegend,
  type AnalysisResult,
} from "./MapDataExplorer";
import type { MapAnalysisSettings } from "../../lib/modules/planning/map-analysis";
import RelatedRecords from "./RelatedRecords";
import { browserVault } from "../../lib/local-first/browser-engine";
import { smallPreview } from "../../lib/modules/media/thumbnail";
import type { MediaProfile } from "../../lib/modules/media/profile";
import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FeatureCollection } from "geojson";
import {
  WorkspaceButton as Button,
  WorkspaceHeader,
  WorkspaceSheet,
  WorkspaceFeedback,
  WorkspaceEmpty,
} from "../admin-shell/WorkspaceKit";
import SharedAIDock from "../admin-shell/SharedAIDock";
import SelectField from "../ui/SelectField";
import DateField from "../people/DateField";
import RecordLinks from "./RecordLinks";
import {
  planningRequest,
  savePlanning,
  savePlanningTrip,
  type PlanningSnapshot,
} from "../../lib/modules/planning/repository";
import type { Place } from "../../lib/modules/planning/types";
import type {
  PersonalTrip,
  TravelMode,
} from "../../lib/modules/personal-life/types";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { moduleThemeVariables } from "../../lib/design-system/color-system";
import styles from "./MapWorkspace.module.css";
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>Loading map…</div>,
});
const STATES =
  "01:Alabama|02:Alaska|04:Arizona|05:Arkansas|06:California|08:Colorado|09:Connecticut|10:Delaware|11:District of Columbia|12:Florida|13:Georgia|15:Hawaii|16:Idaho|17:Illinois|18:Indiana|19:Iowa|20:Kansas|21:Kentucky|22:Louisiana|23:Maine|24:Maryland|25:Massachusetts|26:Michigan|27:Minnesota|28:Mississippi|29:Missouri|30:Montana|31:Nebraska|32:Nevada|33:New Hampshire|34:New Jersey|35:New Mexico|36:New York|37:North Carolina|38:North Dakota|39:Ohio|40:Oklahoma|41:Oregon|42:Pennsylvania|44:Rhode Island|45:South Carolina|46:South Dakota|47:Tennessee|48:Texas|49:Utah|50:Vermont|51:Virginia|53:Washington|54:West Virginia|55:Wisconsin|56:Wyoming|72:Puerto Rico"
    .split("|")
    .map((value) => value.split(":"));
type SearchPlace = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};
export default function MapWorkspace() {
  const params = useSearchParams();
  const [showPhotos, setShowPhotos] = useState(false),
    [photos, setPhotos] = useState<
      Array<{
        id: string;
        label: string;
        url: string;
        latitude: number;
        longitude: number;
      }>
    >([]);
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setPhotos([]);
    if (showPhotos) {
      if (!browserVault.isUnlocked())
        setError("Unlock Vault to view saved photo locations.");
      else
        void (async () => {
          const objects = await browserVault.listObjects(["media"]);
          for (const object of objects
            .filter((o) => !o.tombstone)
            .slice(0, 200)) {
            const profile = object.fields
              .mediaProfile as unknown as MediaProfile;
            if (
              !profile?.location ||
              profile.archivedAt ||
              !profile.manifest.mimeType.startsWith("image/")
            )
              continue;
            try {
              const blob = await smallPreview(object);
              if (!active) break;
              const url = URL.createObjectURL(blob);
              urls.push(url);
              setPhotos((current) => [
                ...current,
                {
                  id: String(object.fields.id || object.objectId),
                  label: String(
                    object.fields.title || profile.manifest.fileName,
                  ),
                  url,
                  ...profile.location!,
                },
              ]);
              if (urls.length >= 24) break;
            } catch {
              /* The regular record remains available when a thumbnail cannot load. */
            }
          }
        })().catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [showPhotos]);
  useEffect(() => {
    const locked = () => {
      setShowPhotos(false);
      setPhotos([]);
    };
    window.addEventListener("unigentamos-vault-locked", locked);
    return () => window.removeEventListener("unigentamos-vault-locked", locked);
  }, []);
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState<"name" | "updated">("name"),
    [selectedId, setSelectedId] = useState(""),
    [pinning, setPinning] = useState(false),
    [mobileList, setMobileList] = useState(false),
    [ai, setAi] = useState(false);
  const [editor, setEditor] = useState<Partial<Place>>(),
    [searchResults, setSearchResults] = useState<SearchPlace[]>([]),
    [viewport, setViewport] = useState<{
      center: [number, number];
      zoom: number;
    }>({ center: [-30, 25], zoom: 2 }),
    [view, setView] = useState<typeof viewport>(),
    [viewName, setViewName] = useState("");
  const [trip, setTrip] = useState<Partial<PersonalTrip>>(),
    [route, setRoute] = useState<FeatureCollection>(),
    [level, setLevel] = useState("country"),
    [stateCode, setStateCode] = useState("");
  const [analysis, setAnalysis] = useState<MapAnalysisSettings>({
    metrics: [],
    match: "all",
    scale: "quantile",
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>();
  const [analysisLoadKey, setAnalysisLoadKey] = useState(0);
  async function refresh() {
    try {
      setSnapshot(await planningRequest<PlanningSnapshot>());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, []);
  useEffect(() => {
    const lat = Number(params.get("latitude")),
      lon = Number(params.get("longitude"));
    if (
      params.has("latitude") &&
      params.has("longitude") &&
      Number.isFinite(lat) &&
      Math.abs(lat) <= 90 &&
      Number.isFinite(lon) &&
      Math.abs(lon) <= 180
    ) {
      newPlace({
        latitude: lat,
        longitude: lon,
        name: params.get("name") || "Photo location",
        address: "",
      });
      setView({ center: [lon, lat], zoom: 13 });
    }
    if (params.get("selected")) setSelectedId(params.get("selected")!);
  }, [params]);
  useEffect(() => {
    const id = params.get("trip");
    const existing = snapshot?.trips.find((t) => t.id === id);
    if (existing) startTrip(existing);
  }, [params, Boolean(snapshot)]);
  const selected = snapshot?.state.places.find((p) => p.id === selectedId);
  const places = useMemo(
    () =>
      (snapshot?.state.places || [])
        .filter(
          (p) =>
            !p.archivedAt &&
            (!tag || p.tags.includes(tag)) &&
            `${p.name} ${p.address} ${p.notes} ${p.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [snapshot, query, tag, sort],
  );
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(message);
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function mapRequest<T>(
    params: Record<string, string> | { coordinates: number[][]; mode: string },
  ): Promise<T> {
    const routing = "coordinates" in params;
    const response = await fetch(
      routing
        ? "/api/map"
        : `/api/map?${new URLSearchParams(params as Record<string, string>)}`,
      routing
        ? {
            method: "POST",
            headers: buildJsonHeadersWithCsrf(),
            body: JSON.stringify(params),
          }
        : undefined,
    );
    const result = await response.json();
    if (!response.ok || !result.ok)
      throw new Error(result.error || "Map data is unavailable");
    return result.data;
  }
  function newPlace(place?: SearchPlace) {
    setEditor(
      place
        ? { ...place, tags: [], notes: "", linkedRefs: [] }
        : {
            name: "",
            address: "",
            latitude: undefined,
            longitude: undefined,
            tags: [],
            notes: "",
            linkedRefs: [],
          },
    );
  }
  async function search() {
    await action(
      async () =>
        { const results = await mapRequest<SearchPlace[]>({ q: query }); setSearchResults(results); setMobileList(true); if (!results.length) setError("No matching addresses found. Add a city or postal code."); },
      "",
    );
  }
  async function savePlace(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    if (
      await action(async () => {
        const result = await savePlanning("places", editor, editor.updatedAt);
        setSelectedId(result.id);
      }, "Place saved")
    )
      setEditor(undefined);
  }
  function startTrip(existing?: PersonalTrip) {
    setTrip(
      existing || {
        name: "",
        place: "",
        region: "",
        status: "planned",
        travelMode: "car",
        latitude: 0,
        longitude: 0,
        startDate: "",
        endDate: "",
        notes: "",
        stops: [],
      },
    );
    setRoute(existing?.route as unknown as FeatureCollection | undefined);
  }
  function addStop(place: Place) {
    setTrip((current) =>
      current
        ? {
            ...current,
            stops: [
              ...(current.stops || []),
              {
                id: crypto.randomUUID(),
                placeId: place.id,
                name: place.name,
                latitude: place.latitude,
                longitude: place.longitude,
              },
            ],
            route: undefined,
          }
        : current,
    );
    setRoute(undefined);
  }
  async function saveTrip(e: FormEvent) {
    e.preventDefault();
    if (!trip) return;
    const first = trip.stops?.[0];
    if (
      await action(async () => {
        const result = await savePlanningTrip({
          ...trip,
          place: first?.name || trip.place,
          latitude: first?.latitude ?? trip.latitude,
          longitude: first?.longitude ?? trip.longitude,
        });
        setTrip(result);
      }, "Trip saved")
    )
      setNotice("Trip saved. Its dates are available in Calendar.");
  }
  async function calculate() {
    if (!trip) return;
    await action(async () => {
      const result = await mapRequest<FeatureCollection>({
        coordinates: (trip.stops || []).map((p) => [p.longitude, p.latitude]),
        mode: trip.travelMode || "car",
      });
      setRoute(result);
      const summary = result.features[0].properties?.summary;
      setTrip({
        ...trip,
        route: {
          ...result,
          distance: Number(summary?.distance || 0),
          duration: Number(summary?.duration || 0),
          calculatedAt: new Date().toISOString(),
          mode: trip.travelMode || "car",
          legs: (result.features[0].properties?.segments || []).map(
            (leg: { distance: number; duration: number }) => ({
              distance: leg.distance,
              duration: leg.duration,
            }),
          ),
        },
      });
    }, "Route calculated. Save the trip to keep it.");
  }
  return (
    <div
      className={`work-surface ${styles.shell}`}
      style={moduleThemeVariables("map") as CSSProperties}
    >
      <div className={styles.mapToolbar} aria-label="Map controls" onKeyDown={e => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.closest(".work-search") && query.trim().length >= 3 && !busy) { e.preventDefault(); void search(); }
      }}>
      <WorkspaceHeader title="Map">
        <Button icon="travel" onClick={() => startTrip()}>Plan trip</Button>
        <Button intent="primary" icon="plus" aria-label="Save place" onClick={() => newPlace()}>
          Save place
        </Button>
      </WorkspaceHeader>
      <div className="work-toolbar">
        <label className="work-search"><UnigentamosIcon role="search" size={20} /><input type="search" aria-label="Search places or addresses" placeholder="Search places or addresses" value={query} onChange={e => setQuery(e.target.value)} /><button type="button" className={styles.addressSearch} aria-label="Find address on map" disabled={query.trim().length < 3 || busy} onClick={() => void search()}><UnigentamosIcon role="chevron-right" size={16} /></button></label>
        <Popover.Root><Popover.Trigger asChild><Button icon="filter" aria-label="Filter" aria-pressed={!!tag}>Filter{tag ? " (1)" : ""}</Button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.filterPopover} style={moduleThemeVariables("map") as CSSProperties} sideOffset={8} collisionPadding={12} align="start" aria-label="Filter saved places" onOpenAutoFocus={e => e.preventDefault()}>
          <>
            <label>
              Tag
              <SelectField value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {[
                  ...new Set(
                    snapshot?.state.places.flatMap((p) => p.tags) || [],
                  ),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </SelectField>
            </label>
            <label>
              Sort
              <SelectField
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="name">Name</option>
                <option value="updated">Recently updated</option>
              </SelectField>
            </label>
            <Button
              onClick={() => {
                setTag("");
                setQuery("");
              }}
            >
              Reset filters
            </Button>
          </>
        </Popover.Content></Popover.Portal></Popover.Root>
        <Button icon="location" aria-label={pinning ? "Cancel pin" : "Drop pin"} aria-pressed={pinning} onClick={() => setPinning(!pinning)}>
          {pinning ? "Cancel pin" : "Drop pin"}
        </Button>
        <Popover.Root open={mobileList} onOpenChange={setMobileList}><Popover.Trigger asChild><Button icon="list" aria-label="Saved places" className={styles.listToggle} aria-pressed={mobileList}>Saved places</Button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.placesPopover} style={moduleThemeVariables("map") as CSSProperties} sideOffset={8} collisionPadding={12} align="start" aria-label="Saved places and trips" onOpenAutoFocus={e => e.preventDefault()}><header className={styles.explorerHeader}><strong>Saved places</strong><Popover.Close asChild><Button icon="close" aria-label="Close saved places">Close</Button></Popover.Close></header>        <div className={styles.placesDirectory}>
          <details className={styles.savedViews}>
            <summary>Saved views</summary>
            <div className="work-form">
              {snapshot?.state.savedViews
                .filter((x) => !x.archivedAt)
                .map((x) => (
                  <Button
                    key={x.id}
                    onClick={() => {
                      setQuery(x.query);
                      setTag(x.tag);
                      setSort(x.sort);
                      setLevel(
                        x.level ||
                          (x.layer.startsWith("world") ? "country" : "state"),
                      );
                      setStateCode(x.stateCode || "");
                      setAnalysis(
                        x.analysis || {
                          metrics:
                            x.layer !== "none" ? [{ metric: x.layer }] : [],
                          match: "all",
                          scale: "quantile",
                        },
                      );
                      setAnalysisLoadKey((key) => key + 1);
                      setView({ center: x.center, zoom: x.zoom });
                    }}
                  >
                    {x.name}
                  </Button>
                ))}
              <label>
                View name
                <input
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                />
              </label>
              <Button
                disabled={!viewName || busy}
                onClick={() =>
                  void action(
                    () =>
                      savePlanning("savedViews", {
                        name: viewName,
                        query,
                        tag,
                        sort,
                        layer: analysis.metrics[0]?.metric || "none",
                        analysis,
                        level,
                        stateCode,
                        ...viewport,
                      }),
                    "View saved",
                  ).then((ok) => {
                    if (ok) setViewName("");
                  })
                }
              >
                Save current view
              </Button>
            </div>
          </details>
          {searchResults.length > 0 && (
            <section className={styles.searchResults}>
              <h2>Search results</h2>
              {searchResults.map((p, i) => (
                <button
                  className="work-row"
                  key={i}
                  onClick={() => {
                    setMobileList(false);
                    newPlace(p);
                    setView({ center: [p.longitude, p.latitude], zoom: 13 });
                  }}
                >
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.address}</small>
                  </div>
                </button>
              ))}
              <Button intent="quiet" onClick={() => setSearchResults([])}>
                Clear search results
              </Button>
            </section>
          )}
          {places.map((p) => (
            <button
              className="work-row"
              key={p.id}
              aria-pressed={selectedId === p.id}
              onClick={() => {
                setSelectedId(p.id);
                setMobileList(false);
              }}
            >
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.address ||
                    `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}
                </small>
                {p.tags.length > 0 && <small>{p.tags.join(" · ")}</small>}
              </div>
            </button>
          ))}
          {!places.length && (
            <WorkspaceEmpty
              title={snapshot ? "No saved places" : "Loading places"}
            >
              Search for a place, drop a pin, or enter coordinates.
            </WorkspaceEmpty>
          )}
          {(snapshot?.trips.length || 0) > 0 && (
            <section className={styles.trips}>
              <h2>Trips</h2>
              {snapshot?.trips.map((t) => (
                <button
                  className="work-row"
                  key={t.id}
                  onClick={() => startTrip(t)}
                >
                  <div>
                    <strong>{t.name}</strong>
                    <small>
                      {t.stops?.length || 1} stops · {t.status}
                    </small>
                  </div>
                </button>
              ))}
            </section>
          )}
          <label className={styles.photoToggle}>
            <input
              type="checkbox"
              checked={showPhotos}
              onChange={(e) => setShowPhotos(e.target.checked)}
            />
            Photo locations
          </label>
        </div></Popover.Content></Popover.Portal></Popover.Root>
        <Popover.Root><Popover.Trigger asChild><Button icon="build" aria-label="Explore data">Explore data{analysis.metrics.length ? ' (' + analysis.metrics.length + ')' : ''}</Button></Popover.Trigger>
          <Popover.Portal forceMount><Popover.Content forceMount className={styles.dataPopover} style={moduleThemeVariables("map") as CSSProperties} sideOffset={8} collisionPadding={12} align="end" aria-label="Explore map data" onOpenAutoFocus={e => e.preventDefault()}>
            <header className={styles.explorerHeader}><div><strong>Explore data</strong><small>Compare places through geographic data</small></div><Popover.Close asChild><Button aria-label="Close data explorer" icon="close">Close</Button></Popover.Close></header>
          <MapDataExplorer
            level={level}
            state={stateCode}
            states={STATES}
            settings={analysis}
            onLevel={(next) => {
              setLevel(next);
              setView(undefined);
            }}
            onState={(next) => {
              setStateCode(next);
              setView(undefined);
            }}
            onSettings={(next) => {
              setAnalysis(next);
              setView(undefined);
            }}
            onResult={setAnalysisResult}
            loadKey={analysisLoadKey}
          />

          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div>
      </div>
      <WorkspaceFeedback error={error} message={notice} />
      {pinning && (
        <p className={styles.hint}>
          Select a point on the map, or use Save place to enter coordinates.
        </p>
      )}
      {snapshot?.persistence === "device" && (
        <p className="work-muted" role="status">
          Saved on this device. Pending changes will synchronize when the
          connection is restored.
        </p>
      )}
      <div className={styles.workspace}>

        <div className={styles.map}>
          <MapCanvas
            photos={photos}
            places={places}
            selected={selected}
            pinning={pinning}
            onSelect={setSelectedId}
            onPin={(longitude, latitude) => {
              setPinning(false);
              newPlace({ name: "", address: "", longitude, latitude });
            }}
            onViewport={(center, zoom) => setViewport({ center, zoom })}
            view={view}
            route={route}
            stops={trip?.stops}
            regions={analysisResult?.geometry}
            regionExtent={view ? undefined : analysisResult?.data[0].geometry}
            regionGeography={analysisResult?.data[0].geography}
          />
          {analysisResult && <MapDataLegend result={analysisResult} />}
          {selected && (
            <section className={styles.placeCard}>
              <div className={styles.placeHeading}>
                <h2>{selected.name}</h2>
                <Button
                  intent="quiet"
                  aria-label="Close place preview"
                  onClick={() => setSelectedId("")}
                >
                  ×
                </Button>
              </div>
              <p>{selected.address}</p>
              {selected.notes && <p>{selected.notes}</p>}
              <RecordLinks refs={selected.linkedRefs} />
              <RelatedRecords module="map" type="place" id={selected.id} />
              <div className="work-actions">
                <Button onClick={() => setEditor(selected)}>Edit place</Button>
                <Link
                  className="work-button"
                  href={`/admin/calendar?place=${encodeURIComponent(selected.id)}`}
                >
                  Open Calendar
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
      <WorkspaceSheet
        open={Boolean(editor)}
        onClose={() => setEditor(undefined)}
        title={editor?.id ? "Edit place" : "Save place"}
      >
        {editor && (
          <form className="work-form" onSubmit={savePlace}>
            <WorkspaceFeedback error={error} />
            <label>
              Name
              <input
                required
                autoFocus
                value={editor.name || ""}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            <PlaceLocationFields value={editor} onChange={patch => setEditor(current => current ? { ...current, ...patch } : current)} />
            <label>
              Tags
              <input
                value={editor.tags?.join(", ") || ""}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    tags: e.target.value.split(",").map((x) => x.trim()),
                  })
                }
              />
            </label>
            <label>
              Notes
              <textarea
                value={editor.notes || ""}
                onChange={(e) =>
                  setEditor({ ...editor, notes: e.target.value })
                }
              />
            </label>
            <RecordLinks
              refs={editor.linkedRefs || []}
              available={snapshot?.refs}
              onChange={(linkedRefs) => setEditor({ ...editor, linkedRefs })}
            />
            <div className="work-actions">
              <Button intent="primary" type="submit" busy={busy}>
                Save place
              </Button>
              {editor.id && (
                <Button
                  intent="danger"
                  onClick={() =>
                    void action(
                      () =>
                        savePlanning(
                          "places",
                          {
                            id: editor.id,
                            archivedAt: new Date().toISOString(),
                          },
                          editor.updatedAt,
                        ),
                      "Place archived",
                    ).then((ok) => {
                      if (ok) {
                        setEditor(undefined);
                        setSelectedId("");
                      }
                    })
                  }
                >
                  Archive
                </Button>
              )}
            </div>
          </form>
        )}
      </WorkspaceSheet>
      <WorkspaceSheet
        open={Boolean(trip)}
        onClose={() => setTrip(undefined)}
        title="Trip itinerary"
      >
        {trip && (
          <form className="work-form" onSubmit={saveTrip}>
            <WorkspaceFeedback error={error} message={notice} />
            <label>
              Trip name
              <input
                required
                value={trip.name || ""}
                onChange={(e) => setTrip({ ...trip, name: e.target.value })}
              />
            </label>
            <div className="work-form-pair">
              <DateField
                label="Starts"
                required={false}
                value={trip.startDate?.slice(0, 10) || ""}
                onChange={(startDate) => setTrip({ ...trip, startDate })}
              />
              <DateField
                label="Ends"
                required={false}
                value={trip.endDate?.slice(0, 10) || ""}
                onChange={(endDate) => setTrip({ ...trip, endDate })}
              />
            </div>
            <label>
              Travel mode
              <SelectField
                value={trip.travelMode || "car"}
                onChange={(e) => {
                  setTrip({
                    ...trip,
                    travelMode: e.target.value as TravelMode,
                    route: undefined,
                  });
                  setRoute(undefined);
                }}
              >
                {[
                  "car",
                  "walk",
                  "bike",
                  "plane",
                  "train",
                  "boat",
                  "bus",
                  "other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </SelectField>
            </label>
            <section>
              <h2>Stops</h2>
              {trip.stops?.map((stop, index) => (
                <div className={styles.stop} key={stop.id}>
                  <strong>
                    {index + 1}. {stop.name}
                  </strong>
                  {index > 0 && trip.route?.legs?.[index - 1] && (
                    <small>
                      From previous stop:{" "}
                      {(trip.route.legs[index - 1].distance / 1000).toFixed(1)}{" "}
                      km · about{" "}
                      {Math.ceil(trip.route.legs[index - 1].duration / 60)} min
                    </small>
                  )}
                  <label>
                    Arrival
                    <input
                      type="datetime-local"
                      value={stop.arrival || ""}
                      onChange={(e) =>
                        setTrip({
                          ...trip,
                          stops: trip.stops!.map((s) =>
                            s.id === stop.id
                              ? { ...s, arrival: e.target.value }
                              : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <div className="work-actions">
                    <Button
                      disabled={index === 0}
                      aria-label={`Move ${stop.name} earlier`}
                      onClick={() => {
                        const stops = [...trip.stops!];
                        [stops[index - 1], stops[index]] = [
                          stops[index],
                          stops[index - 1],
                        ];
                        setTrip({ ...trip, stops, route: undefined });
                        setRoute(undefined);
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      disabled={index === trip.stops!.length - 1}
                      aria-label={`Move ${stop.name} later`}
                      onClick={() => {
                        const stops = [...trip.stops!];
                        [stops[index + 1], stops[index]] = [
                          stops[index],
                          stops[index + 1],
                        ];
                        setTrip({ ...trip, stops, route: undefined });
                        setRoute(undefined);
                      }}
                    >
                      ↓
                    </Button>
                    <Button
                      aria-label={`Remove ${stop.name}`}
                      onClick={() => {
                        setTrip({
                          ...trip,
                          stops: trip.stops!.filter((x) => x.id !== stop.id),
                          route: undefined,
                        });
                        setRoute(undefined);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              <label>
                Add a saved place
                <SelectField
                  value=""
                  onChange={(e) => {
                    const place = snapshot?.state.places.find(
                      (x) => x.id === e.target.value,
                    );
                    if (place) addStop(place);
                  }}
                >
                  <option value="">Choose place</option>
                  {snapshot?.state.places
                    .filter((p) => !p.archivedAt)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </SelectField>
              </label>
            </section>
            <Button
              disabled={
                busy ||
                (trip.stops?.length || 0) < 2 ||
                !["car", "walk", "bike"].includes(trip.travelMode || "")
              }
              onClick={() => void calculate()}
            >
              Calculate route
            </Button>
            {trip.route && (
              <p>
                {(trip.route.distance / 1000).toFixed(1)} km · about{" "}
                {Math.round(trip.route.duration / 60)} min
                <br />
                <small>Estimated travel time without live traffic.</small>
              </p>
            )}
            <label>
              Notes
              <textarea
                value={trip.notes || ""}
                onChange={(e) => setTrip({ ...trip, notes: e.target.value })}
              />
            </label>
            <Button
              type="submit"
              intent="primary"
              busy={busy}
              disabled={!trip.stops?.length && !trip.place}
            >
              Save trip
            </Button>
            {trip.id && (
              <Link href={`/admin/personal/travel?selected=${trip.id}`}>
                Open in Personal
              </Link>
            )}
          </form>
        )}
      </WorkspaceSheet>
      <SharedAIDock
        open={ai}
        onOpenChange={setAi}
        context={{
          module: "map",
          visibleScope: `${places.length} saved places`,
          allowedActions: [
            "Summarize visible places",
            "Draft a reviewed itinerary",
          ],
        }}
      />
    </div>
  );
}
