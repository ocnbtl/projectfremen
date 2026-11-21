"use client";
import { useMemo, useState } from "react";
import { IconAdjustments, IconChevronRight } from "@tabler/icons-react";
import type { Board, CanvasArrangementBand, CanvasArrangementOptions, CanvasCategory, CanvasNode } from "../../lib/modules/canvas/model";
import SelectField from "../ui/SelectField";
import { defaultArrangementOptions, organizeBoard } from "./board-organization";
import type { OrganizerOptions } from "./organizer-rows";
import styles from "./CanvasTaxonomy.module.css";

type Axis = "row" | "column";
type Settings = {options: CanvasArrangementOptions; update: (patch: Partial<CanvasArrangementOptions>) => void};

function OptionalColor({label, value, fallback, onChange}: {
  label: string; value?: string; fallback: string; onChange: (value?: string) => void;
}) {
  return <div className={styles.colorOption}>
    <label><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? fallback : undefined)}/>{label}</label>
    {value && <input type="color" aria-label={label + " color"} value={value} onChange={e => onChange(e.target.value)}/>}
  </div>;
}

function AxisSettings({axis, bands, options, update}: Settings & {axis: Axis; bands: CanvasArrangementBand[]}) {
  const name = axis === "row" ? "Row" : "Column";
  const [selectedKey, select] = useState<string>();
  const band = bands.find(item => item.key === selectedKey) ?? bands[0];
  const overrides = options.labelOverrides ?? [];
  const override = overrides.find(item => item.axis === axis && item.key === band?.key);
  const axisName = axis === "row" ? "rowName" : "columnName";
  const tint = axis === "row" ? "rowTint" : "columnTint";
  const alternateTint = axis === "row" ? "rowAlternateTint" : "columnAlternateTint";
  const outline = axis === "row" ? "rowOutline" : "columnOutline";
  function rename(label: string) {
    if (!band) return;
    const other = overrides.filter(item => item.axis !== axis || item.key !== band.key);
    update({labelOverrides: label ? [...other, {axis, key: band.key, label}] : other});
  }
  return <details className={styles.nested}>
    <summary>{name} headers<IconChevronRight aria-hidden size={14}/></summary>
    <div className={styles.settings}>
      <label>{name} heading<input value={options[axisName] ?? ""} maxLength={80} placeholder={bands[0]?.axisName || name} onChange={e => update({[axisName]: e.target.value})}/></label>
      {band && <>
        <label>{name} to rename<SelectField portalToBody aria-label={name + " to rename"} value={band.key} onChange={e => select(e.target.value)}>
          {bands.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </SelectField></label>
        <label>{name} label<input value={override?.label ?? ""} maxLength={80} placeholder={band.label} onChange={e => rename(e.target.value)}/></label>
      </>}
      <OptionalColor label={name + " tint"} fallback="#739ac0" value={options[tint]}
        onChange={value => update({[tint]:value, [alternateTint]:value ? (options[tint] ? options[alternateTint] : "#ffffff") : undefined})}/>
      {options[tint] && <>
        <label>{name} tint pattern<SelectField portalToBody value={options[alternateTint] ? "alternating" : "uniform"}
          onChange={e => update({[alternateTint]: e.target.value === "alternating" ? "#ffffff" : undefined})}>
          <option value="alternating">Alternating colors</option><option value="uniform">Every band the same</option>
        </SelectField></label>
        {options[alternateTint] && <div className={styles.colorOption}><label>Alternate {axis} color<input type="color" value={options[alternateTint]} onChange={e => update({[alternateTint]: e.target.value})}/></label></div>}
      </>}
      <OptionalColor label={name + " outline"} fallback="#59748d" value={options[outline]} onChange={value => update({[outline]: value})}/>
    </div>
  </details>;
}

function Appearance({options, update}: Settings) {
  return <details className={styles.nested}>
    <summary>Header appearance<IconChevronRight aria-hidden size={14}/></summary>
    <div className={styles.settings}>
      <div className={styles.controls}>
        <label>Header style<SelectField portalToBody value={options.headerStyle} onChange={e => update({headerStyle: e.target.value as CanvasArrangementOptions["headerStyle"]})}>
          <option value="solid">Solid</option><option value="outline">Outline</option><option value="minimal">Underline</option>
        </SelectField></label>
        <label>Header font<SelectField portalToBody value={options.headerFont ?? "sans"} onChange={e => update({headerFont: e.target.value as CanvasArrangementOptions["headerFont"]})}>
          <option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospace</option>
        </SelectField></label>
        <label>Alignment<SelectField portalToBody value={options.headerAlign ?? "left"} onChange={e => update({headerAlign: e.target.value as CanvasArrangementOptions["headerAlign"]})}>
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </SelectField></label>
        <label className={styles.boldOption}><input type="checkbox" checked={options.headerBold !== false} onChange={e => update({headerBold: e.target.checked})}/>Bold text</label>
      </div>
      <div className={styles.colorOption}><label>Header color<input type="color" value={options.headerColor} onChange={e => update({headerColor:e.target.value})}/></label></div>
      <OptionalColor label="Custom text" fallback="#203448" value={options.headerTextColor} onChange={value => update({headerTextColor:value})}/>
    </div>
  </details>;
}

export function ArrangementControls({board, nodes, categories, organizer, options, update}: Settings & {
  board: Board; nodes: CanvasNode[]; categories: CanvasCategory[]; organizer: OrganizerOptions;
}) {
  const [open, setOpen] = useState(false);
  const {rowBy, columnBy} = options;
  const preview = useMemo(() => {
    if (!open) return {};
    try {
      const next = organizeBoard({...board, nodes, categories}, organizer, {...defaultArrangementOptions, rowBy, columnBy});
      return {bands: next.arrangement?.bands ?? []};
    } catch (error) {
      return {error: error instanceof Error ? error.message : "The header preview is unavailable."};
    }
  }, [open, board, nodes, categories, organizer, rowBy, columnBy]);
  return <details className={styles.filter} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><IconAdjustments aria-hidden size={16}/>Headers and bands<IconChevronRight aria-hidden size={15}/></summary>
    {open && <div className={styles.subsections}>
      <Appearance options={options} update={update}/>
      {(["row", "column"] as const).map(axis => <AxisSettings key={axis} axis={axis} options={options} update={update}
        bands={(preview.bands ?? []).filter(band => band.axis === axis)}/>)}
      {preview.error && <p className={styles.note} role="status">{preview.error}</p>}
    </div>}
  </details>;
}
