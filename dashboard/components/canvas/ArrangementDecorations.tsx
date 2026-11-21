import type { CanvasArrangement, CanvasArrangementBand, CanvasArrangementOptions } from "../../lib/modules/canvas/model";

const fonts = {
  sans: "Inter, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', monospace",
};

function readableInk(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? "#111111" : "#ffffff";
}

function Header({band, options}: {band: CanvasArrangementBand; options: CanvasArrangementOptions}) {
  const {width, height, fontSize} = band;
  const color = options.headerColor;
  const solid = options.headerStyle === "solid";
  const ink = options.headerTextColor ?? (solid ? readableInk(color) : "#25384c");
  const align = options.headerAlign ?? "left";
  const inset = Math.min(width * .12, fontSize * .8);
  const x = align === "left" ? inset : align === "right" ? width - inset : width / 2;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const radius = Math.min(height / 5, fontSize * .4);
  return <svg x={band.x} y={band.y} width={width} height={height} overflow="hidden"
    data-arrangement-header={band.axis} data-band-key={band.key}>
    <title>{[band.axisName, band.label].filter(Boolean).join(" · ")}</title>
    {solid && <rect width={width} height={height} rx={radius} fill={color}/>}
    {options.headerStyle === "outline" && <rect x={1} y={1} width={Math.max(0,width-2)} height={Math.max(0,height-2)}
      fill="none" stroke={color} strokeWidth={2} rx={radius}/>}
    {options.headerStyle === "minimal" && <path d={`M 0 ${height-1} H ${width}`} fill="none" stroke={color} strokeWidth={2}/>}
    <g fill={ink} textAnchor={anchor} fontFamily={fonts[options.headerFont ?? "sans"]}>
      {band.axisName && <text x={x} y={height / 2 - fontSize * .24} fontSize={fontSize * .65}>{band.axisName}</text>}
      <text x={x} y={height / 2 + fontSize * (band.axisName ? .82 : .35)}
        fontSize={fontSize} fontWeight={options.headerBold === false ? 400 : 700}>{band.label}</text>
    </g>
  </svg>;
}

export function ArrangementDecorations({arrangement}: {arrangement?: CanvasArrangement}) {
  if (!arrangement) return null;
  const axisIndex = {row: 0, column: 0};
  return <g pointerEvents="none" data-canvas-arrangement="" aria-hidden="true">
    {arrangement.bands.map(band => {
      const row = band.axis === "row";
      const baseTint = row ? arrangement.rowTint : arrangement.columnTint;
      const alternateTint = row ? arrangement.rowAlternateTint : arrangement.columnAlternateTint;
      const tint = axisIndex[band.axis]++ % 2 ? alternateTint ?? baseTint : baseTint;
      const outline = row ? arrangement.rowOutline : arrangement.columnOutline;
      return (tint || outline) && <rect key={band.axis + "/" + band.key} {...band.region}
        data-arrangement-band={band.axis} fill={tint ?? "none"} fillOpacity={.12}
        stroke={outline ?? "none"} strokeWidth={Math.max(1, band.fontSize * .07)}/>;
    })}
    {arrangement.bands.map(band => <Header key={band.axis + "/" + band.key} band={band} options={arrangement}/>)}
  </g>;
}
