"use client";
import LogoLoader from "../operational/LogoLoader";
import { motionTokens } from "../../lib/design-system/motion";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";
import { regionBounds } from "../../lib/modules/planning/map-bounds";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Place } from "../../lib/modules/planning/types";
import { useMotionPreference } from "../admin-shell/ExperienceProvider";
type Props = {
  places: (Place & { latitude: number; longitude: number })[];
  photos?: {
    id: string;
    label: string;
    url: string;
    latitude: number;
    longitude: number;
  }[];
  selected?: Place & { latitude: number; longitude: number };
  pinning: boolean;
  onSelect: (id: string) => void;
  onPin: (longitude: number, latitude: number) => void;
  onViewport: (center: [number, number], zoom: number) => void;
  view?: { center: [number, number]; zoom: number };
  route?: FeatureCollection;
  stops?: { id: string; name: string; latitude: number; longitude: number }[];
  regions?: FeatureCollection;
  regionExtent?: FeatureCollection | null;
  regionGeography?: string;
};
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
export default function MapCanvas(props: Props) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null),
    current = useRef(props);
  current.current = props;
  const fitted = useRef(false);
  const photoMarkers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const { preference } = useMotionPreference();
  const motionPreference = useRef(preference);
  motionPreference.current = preference;
  useEffect(() => {
    if (!container.current) return;
    let instance: MapInstance;
    try {
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      instance = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-30, 25],
        zoom: 2,
        attributionControl: false,
      });
    } catch {
      setError(
        "The map cannot start on this device. All saved locations remain available in the list.",
      );
      return;
    }
    map.current = instance;
    instance.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "top-right",
    );
    instance.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-right",
    );
    instance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    instance.on("error", () =>
      setError(
        "Some map content could not load. Your saved places and itinerary remain available.",
      ),
    );
    instance.on("load", () => {
      // Thematic land sits above landcover, beneath water, roads and labels.
      // Using the app's place layer here would put fills ABOVE the entire basemap.
      const thematicBefore = instance.getStyle().layers.find((layer) =>
        layer.type === "line" || layer.type === "symbol" ||
        /building|aeroway|transport/i.test(layer.id),
      )?.id;
      instance.addSource("places", {
        type: "geojson",
        data: empty,
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 14,
      });
      instance.addLayer({
        id: "place-clusters",
        type: "circle",
        source: "places",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": MODULE_COLOR_SYSTEM.map.primary[500],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            20,
            23,
            100,
            28,
          ],
          "circle-stroke-color": "white",
          "circle-stroke-width": 2,
        },
      });
      instance.addLayer({
        id: "place-count",
        type: "symbol",
        source: "places",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
        },
        paint: { "text-color": MODULE_COLOR_SYSTEM.map.primary[900] },
      });
      instance.addLayer({
        id: "place-points",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": MODULE_COLOR_SYSTEM.map.primary[500],
          "circle-radius": 7,
          "circle-stroke-color": "white",
          "circle-stroke-width": 2,
        },
      });
      instance.addLayer({
        id: "place-labels",
        type: "symbol",
        source: "places",
        minzoom: 8,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.5],
        },
        paint: {
          "text-color": "#23383f",
          "text-halo-color": "white",
          "text-halo-width": 2,
        },
      });
      instance.addSource("selected", { type: "geojson", data: empty });
      instance.addLayer({
        id: "selected-place",
        type: "circle",
        source: "selected",
        paint: {
          "circle-color": MODULE_COLOR_SYSTEM.map.primary[700],
          "circle-radius": 10,
          "circle-stroke-color": "white",
          "circle-stroke-width": 3,
        },
      });
      instance.addSource("route", { type: "geojson", data: empty });
      instance.addLayer({
        id: "trip-route",
        type: "line",
        source: "route",
        paint: {
          "line-color": MODULE_COLOR_SYSTEM.map.primary[700],
          "line-width": 4,
          "line-opacity": 0.85,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      instance.addSource("stops", { type: "geojson", data: empty });
      instance.addLayer({
        id: "trip-stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-color": MODULE_COLOR_SYSTEM.map.primary[700],
          "circle-radius": 14,
          "circle-stroke-width": 2,
          "circle-stroke-color": "white",
        },
      });
      instance.addLayer({
        id: "trip-stop-numbers",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "number"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "white" },
      });
      instance.addSource("regions", { type: "geojson", data: empty });
      instance.addLayer(
        {
          id: "region-fill",
          type: "fill",
          source: "regions",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": ["coalesce", ["get", "color"], "#c4c9c0"],
            "fill-opacity": [
              "case",
              ["==", ["get", "value"], null],
              0.5,
              ["==", ["get", "matches"], true],
              0.82,
              0.14,
            ],
          },
        },
        thematicBefore,
      );
      instance.addLayer(
        {
          id: "region-outlines",
          type: "line",
          source: "regions",
          paint: {
            "line-color": "#515d6b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 9, 1],
            "line-opacity": 0.5,
          },
        },
        thematicBefore,
      );
      instance.addLayer(
        {
          id: "region-points",
          type: "circle",
          source: "regions",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": ["coalesce", ["get", "color"], "#c4c9c0"],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "normalized"],
              0,
              5,
              1,
              18,
            ],
            "circle-opacity": 0.75,
            "circle-stroke-color": "white",
            "circle-stroke-width": 1,
          },
        },
        "place-clusters",
      );
      // Positron places water below some landcover fills; keep water above the
      // thematic land without covering roads or changing its own styling.
      for (const layer of instance.getStyle().layers.filter((layer) =>
        layer.type === "fill" && /water/i.test(layer.id),
      )) instance.moveLayer(layer.id, thematicBefore);
      setReady(true);
      setError("");
      // MapLibre 6 opens compact attribution initially. Start with the same
      // accessible information button in its collapsed state.
      const attribution = container.current?.querySelector<HTMLElement>(
        ".maplibregl-ctrl-attrib.maplibregl-compact-show summary",
      );
      attribution?.click();
    });
    instance.on("click", (event) => {
      if (current.current.pinning) {
        current.current.onPin(event.lngLat.lng, event.lngLat.lat);
        return;
      }
      if (!instance.getLayer("place-points")) return;
      const features = instance.queryRenderedFeatures(event.point, {
          layers: ["place-clusters", "place-points"],
        }),
        feature = features[0];
      if (!feature) {
        const region = instance.queryRenderedFeatures(event.point, {
          layers: ["region-fill"],
        })[0];
        if (region) {
          const content = document.createElement("div"),
            title = document.createElement("strong");
          title.textContent = String(region.properties.name || "Region");
          content.append(title);
          try {
            const details = JSON.parse(region.properties.details || "[]") as {
              label: string;
              value: number | null;
              unit: string;
              year?: string;
              uncertainty?: number;
            }[];
            for (const d of details) {
              const line = document.createElement("p");
              line.textContent = `${d.label}: ${d.value === null ? "No data" : d.value.toLocaleString()} ${d.unit}${d.uncertainty != null ? ` ± ${d.uncertainty.toLocaleString()}` : ""}${d.year ? ` · ${d.year}` : ""}`;
              content.append(line);
            }
          } catch {}
          new maplibregl.Popup({ maxWidth: "300px" })
            .setLngLat(event.lngLat)
            .setDOMContent(content)
            .addTo(instance);
        }
        return;
      }
      if (feature.properties.cluster_id !== undefined) {
        void (instance.getSource("places") as GeoJSONSource)
          .getClusterExpansionZoom(feature.properties.cluster_id)
          .then((zoom) =>
            instance.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [
                number,
                number,
              ],
              zoom,
              duration:
                motionPreference.current === "reduce" ||
                matchMedia("(prefers-reduced-motion:reduce)").matches
                  ? 0
                  : motionTokens.context * 1000,
            }),
          );
      } else current.current.onSelect(String(feature.properties.id));
    });
    instance.on("moveend", () => {
      const c = instance.getCenter();
      current.current.onViewport([c.lng, c.lat], instance.getZoom());
    });
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (
      !fitted.current &&
      props.places.length &&
      !props.view &&
      !props.selected
    ) {
      const bounds = new maplibregl.LngLatBounds();
      props.places.forEach((p) => bounds.extend([p.longitude, p.latitude]));
      map.current?.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 });
      fitted.current = true;
    }
    (map.current?.getSource("places") as GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: props.places.map((p) => ({
        type: "Feature",
        properties: { id: p.id, name: p.name },
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      })),
    });
  }, [ready, props.places]);
  useEffect(() => {
    if (!ready) return;
    const p = props.selected;
    (map.current?.getSource("selected") as GeoJSONSource)?.setData(
      p
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Point",
                  coordinates: [p.longitude, p.latitude],
                },
              },
            ],
          }
        : empty,
    );
    if (p)
      map.current?.easeTo({
        center: [p.longitude, p.latitude],
        zoom: Math.max(10, map.current.getZoom()),
        duration:
          preference === "reduce" ||
          matchMedia("(prefers-reduced-motion:reduce)").matches
            ? 0
            : motionTokens.map * 1000,
      });
  }, [ready, props.selected?.id, preference]);
  useEffect(() => {
    if (ready)
      (map.current?.getSource("stops") as GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: (props.stops || []).map((stop, index) => ({
          type: "Feature",
          properties: { number: String(index + 1), name: stop.name },
          geometry: {
            type: "Point",
            coordinates: [stop.longitude, stop.latitude],
          },
        })),
      });
  }, [ready, props.stops]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    const draw = () => {
      photoMarkers.current.forEach((marker) => marker.remove());
      photoMarkers.current = [];
      if (instance.getZoom() < 10) return;
      const occupied: Array<{ x: number; y: number }> = [];
      for (const photo of (props.photos || []).slice(0, 24)) {
        if (!instance.getBounds().contains([photo.longitude, photo.latitude]))
          continue;
        const point = instance.project([photo.longitude, photo.latitude]);
        if (occupied.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 52))
          continue;
        occupied.push(point);
        const link = document.createElement("a");
        link.href = `/admin/media?selected=${encodeURIComponent(photo.id)}`;
        link.className = "work-map-photo";
        link.setAttribute("aria-label", `Open photo: ${photo.label}`);
        link.title = photo.label;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          router.push(link.getAttribute("href")!);
        });
        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = "";
        link.append(img);
        const marker = new maplibregl.Marker({
          element: link,
          anchor: "bottom",
        })
          .setLngLat([photo.longitude, photo.latitude])
          .addTo(instance);
        photoMarkers.current.push(marker);
      }
    };
    draw();
    instance.on("moveend", draw);
    return () => {
      instance.off("moveend", draw);
      photoMarkers.current.forEach((marker) => marker.remove());
      photoMarkers.current = [];
    };
  }, [ready, props.photos, router]);
  useEffect(() => {
    if (ready && props.view) map.current?.jumpTo(props.view);
  }, [ready, props.view]);
  useEffect(() => {
    if (ready)
      (map.current?.getSource("route") as GeoJSONSource)?.setData(
        props.route || empty,
      );
  }, [ready, props.route]);
  useEffect(() => {
    if (ready)
      (map.current?.getSource("regions") as GeoJSONSource)?.setData(
        props.regions || empty,
      );
  }, [ready, props.regions]);
  useEffect(() => {
    if (!ready || !map.current || !props.regionExtent) return;
    if (props.regionGeography === "Country") {
      map.current.jumpTo({ center: [-10, 25], zoom: 1.6 });
      return;
    }
    if (props.regionGeography === "state") {
      map.current.jumpTo({ center: [-98, 38], zoom: 3 });
      return;
    }
    const bounds = regionBounds(props.regionExtent);
    if (bounds)
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 0 });
  }, [ready, props.regionExtent, props.regionGeography]);
  useEffect(() => {
    if (map.current)
      map.current.getCanvas().style.cursor = props.pinning ? "crosshair" : "";
  }, [props.pinning]);
  return (
    <>
      <div
        ref={container}
        style={{ position: "absolute", inset: 0 }}
        aria-label="Interactive map. Saved places are also available in the adjacent list."
      />
      {!ready && !error && <LogoLoader label="Loading map" viewport />}
      {error && (
        <p className="map-provider-error" role="status">
          {error}
        </p>
      )}
    </>
  );
}
