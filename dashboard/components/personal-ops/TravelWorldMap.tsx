"use client";

import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { PersonalTrip, TripStatus } from "../../lib/modules/personal-life/types";
import styles from "./PersonalLifeWorkspace.module.css";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

type WorldProperties = { name?: string };
type WorldObjects = {
  countries: GeometryCollection<WorldProperties>;
  land: GeometryCollection<WorldProperties>;
};

type MapTransform = { scale: number; x: number; y: number };
type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean };

const topology = worldData as unknown as Topology<WorldObjects>;
const countryCollection = feature(
  topology,
  topology.objects.countries
) as FeatureCollection<Geometry, WorldProperties>;
const countryBorders = mesh(
  topology,
  topology.objects.countries,
  (left, right) => left !== right
);
const projection = geoNaturalEarth1().fitExtent(
  [[12, 12], [MAP_WIDTH - 12, MAP_HEIGHT - 12]],
  { type: "Sphere" }
);
const path = geoPath(projection);
const spherePath = path({ type: "Sphere" }) || "";
const graticulePath = path(geoGraticule10()) || "";
const borderPath = path(countryBorders) || "";

function clampTransform(value: MapTransform): MapTransform {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value.scale));
  return {
    scale,
    x: Math.min(0, Math.max(MAP_WIDTH * (1 - scale), value.x)),
    y: Math.min(0, Math.max(MAP_HEIGHT * (1 - scale), value.y))
  };
}

function svgPoint(element: SVGSVGElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * MAP_WIDTH,
    y: ((clientY - rect.top) / rect.height) * MAP_HEIGHT
  };
}

export default function TravelWorldMap({
  trips,
  selectedTripId,
  labels,
  onSelectTrip,
  onCreateAt
}: {
  trips: PersonalTrip[];
  selectedTripId: string;
  labels: Record<TripStatus, string>;
  onSelectTrip: (id: string) => void;
  onCreateAt: (latitude: number, longitude: number) => void;
}) {
  const [transform, setTransform] = useState<MapTransform>({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const pins = useMemo(() => trips.map((trip) => ({
    trip,
    point: projection([trip.longitude, trip.latitude])
  })).filter((entry): entry is { trip: PersonalTrip; point: [number, number] } => Boolean(entry.point)), [trips]);

  function zoomAt(nextScale: number, anchor = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }) {
    setTransform((current) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
      const ratio = scale / current.scale;
      return clampTransform({
        scale,
        x: anchor.x - (anchor.x - current.x) * ratio,
        y: anchor.y - (anchor.y - current.y) * ratio
      });
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const anchor = svgPoint(event.currentTarget, event.clientX, event.clientY);
    zoomAt(transform.scale * (event.deltaY > 0 ? 0.84 : 1.18), anchor);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-map-pin]")) return;
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: transform.x,
      originY: transform.y,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    if (transform.scale > 1) {
      setTransform(clampTransform({
        scale: transform.scale,
        x: drag.originX + deltaX,
        y: drag.originY + deltaY
      }));
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) return;
    const coordinate = projection.invert?.([
      (point.x - transform.x) / transform.scale,
      (point.y - transform.y) / transform.scale
    ]);
    if (!coordinate) return;
    const [longitude, latitude] = coordinate;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    onCreateAt(Math.round(latitude * 10) / 10, Math.round(longitude * 10) / 10);
  }

  return (
    <div className={styles.worldMapShell}>
      <div className={styles.mapControls} aria-label="Map controls">
        <button type="button" onClick={() => zoomAt(transform.scale * 1.35)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomAt(transform.scale / 1.35)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}>World</button>
      </div>
      <svg
        className={styles.worldMap}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="application"
        aria-label="Interactive world travel map. Drag to pan, scroll to zoom, or click a coordinate to add a trip."
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        <g transform={`translate(${transform.x.toFixed(1)} ${transform.y.toFixed(1)}) scale(${transform.scale.toFixed(3)})`}>
          <path className={styles.mapSphere} d={spherePath} />
          <path className={styles.mapGraticule} d={graticulePath} />
          {countryCollection.features.map((country: Feature<Geometry, GeoJsonProperties>, index) => (
            <path className={styles.mapCountry} d={path(country) || ""} key={country.id ?? index}>
              <title>{String(country.properties?.name || "Country")}</title>
            </path>
          ))}
          <path className={styles.mapBorders} d={borderPath} />
          {pins.map(({ trip, point }) => (
            <g
              className={styles.mapPin}
              data-map-pin
              data-status={trip.status}
              data-selected={selectedTripId === trip.id || undefined}
              transform={`translate(${point[0].toFixed(1)} ${point[1].toFixed(1)})`}
              role="button"
              tabIndex={0}
              aria-label={`${trip.name}, ${labels[trip.status]}`}
              onClick={(event) => { event.stopPropagation(); onSelectTrip(trip.id); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTrip(trip.id);
                }
              }}
              key={trip.id}
            >
              <circle r={selectedTripId === trip.id ? 8 : 6} />
              <circle className={styles.mapPinCore} r={2.5} />
              <title>{trip.name}</title>
            </g>
          ))}
        </g>
      </svg>
      <span className={styles.mapHint}>Drag to pan · scroll to zoom · click to add a trip</span>
    </div>
  );
}
