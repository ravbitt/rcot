// Lámina del plano en SVG con unidades en mm de papel: sirve para pantalla y para imprimir a escala real.

import { dim2d, formatLength } from "@/lib/geometry/dim";
import { MARGIN, scaleLabel, sheetSize, TITLE_H, TITLE_W, viewRect, viewToPaper } from "@/lib/drawing/sheet-math";
import type { SheetData, SheetDim, SheetStyle, SheetTable, SheetView, Vec2 } from "@/lib/types";
import { DEFAULT_STYLE } from "@/lib/types";

export const styleOf = (data: SheetData): SheetStyle => ({ ...DEFAULT_STYLE, ...data.style });

function segmentsPath(view: SheetView, segs: number[]) {
  let d = "";
  for (let i = 0; i < segs.length; i += 4) {
    const a = viewToPaper(view, [segs[i], segs[i + 1]]);
    const b = viewToPaper(view, [segs[i + 2], segs[i + 3]]);
    d += `M${a[0].toFixed(3)} ${a[1].toFixed(3)}L${b[0].toFixed(3)} ${b[1].toFixed(3)}`;
  }
  return d;
}

export type DimShape = {
  lines: string;
  arrows: string;
  text: { x: number; y: number; angle: number; value: string };
  hit: string;
};

/** Geometría de una cota sobre el papel: líneas, flechas y texto. */
export function dimShape(view: SheetView, dim: Pick<SheetDim, "a" | "b" | "orient" | "offset" | "text">, data: SheetData): DimShape | null {
  const g = dim2d(dim.a, dim.b, dim.orient, dim.offset);
  if (!g) return null;
  const st = styleOf(data);
  const ARROW_L = st.dimArrow;
  const ARROW_W = st.dimArrow * 0.29;
  const P = (p: Vec2) => viewToPaper(view, p);
  const a = P(dim.a), b = P(dim.b), p1 = P(g.p1), p2 = P(g.p2);
  const ext = (from: Vec2, to: Vec2) => {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const l = Math.hypot(dx, dy);
    if (l < 0.01) return "";
    const ux = dx / l, uy = dy / l;
    const s: Vec2 = [from[0] + ux * Math.min(0.8, l * 0.3), from[1] + uy * Math.min(0.8, l * 0.3)];
    const e: Vec2 = [to[0] + ux * 1.5, to[1] + uy * 1.5];
    return `M${s[0]} ${s[1]}L${e[0]} ${e[1]}`;
  };
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  // Flechas hacia afuera si no caben adentro
  const inside = L > ARROW_L * 2.4;
  const arrow = (tip: Vec2, s: number) => {
    const k = inside ? s : -s;
    const bx = tip[0] + ux * ARROW_L * k, by = tip[1] + uy * ARROW_L * k;
    return `M${tip[0]} ${tip[1]}L${bx + nx * ARROW_W} ${by + ny * ARROW_W}L${bx - nx * ARROW_W} ${by - ny * ARROW_W}Z`;
  };
  let line = `M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}`;
  if (!inside) line += `M${p1[0] - ux * ARROW_L * 2} ${p1[1] - uy * ARROW_L * 2}L${p1[0]} ${p1[1]}M${p2[0]} ${p2[1]}L${p2[0] + ux * ARROW_L * 2} ${p2[1] + uy * ARROW_L * 2}`;
  // Texto sobre la línea, legible de abajo hacia arriba o de izquierda a derecha
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90.01) angle -= 180;
  if (angle <= -90.01) angle += 180;
  const rad = (angle * Math.PI) / 180;
  // normal «hacia arriba» del texto
  const tnx = Math.sin(rad), tny = -Math.cos(rad);
  const gap = st.dimText * 0.33;
  const mx = (p1[0] + p2[0]) / 2 + tnx * gap, my = (p1[1] + p2[1]) / 2 + tny * gap;
  const value = dim.text?.trim() || formatLength(g.value, data.unit, data.decimals);
  return {
    lines: ext(a, p1) + ext(b, p2) + line,
    arrows: arrow(p1, 1) + arrow(p2, -1),
    text: { x: mx, y: my, angle, value },
    hit: `M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}`,
  };
}

function TitleBlock({ data }: { data: SheetData }) {
  const [W, H] = sheetSize(data);
  const x = W - MARGIN - TITLE_W;
  const y = H - MARGIN - TITLE_H;
  const t = data.title;
  const cell = (cx: number, cy: number, w: number, h: number, label: string, value: string, big = false) => (
    <g key={label}>
      <rect x={cx} y={cy} width={w} height={h} fill="white" stroke="black" strokeWidth={0.25} />
      <text x={cx + 1.2} y={cy + 2.6} fontSize={1.9} fill="#555">
        {label.toUpperCase()}
      </text>
      <text x={cx + 1.2} y={cy + h - 2} fontSize={big ? 4.2 : 3.2} fontWeight={big ? 700 : 500}>
        {value}
      </text>
    </g>
  );
  return (
    <g className="title-block">
      {cell(x, y, 110, 12, "Proyecto", t.proyecto, true)}
      {cell(x + 110, y, 70, 12, "Cliente", t.cliente)}
      {cell(x, y + 12, 110, 12, "Plano", t.plano, true)}
      {cell(x + 110, y + 12, 35, 12, "Cantidad", t.cantidad, true)}
      {cell(x + 145, y + 12, 35, 12, "Escala", scaleLabel(data))}
      {cell(x, y + 24, 80, 12, "Dibujó", t.dibujo)}
      {cell(x + 80, y + 24, 50, 12, "Fecha", t.fecha)}
      {cell(x + 130, y + 24, 50, 12, "Unidad", data.unit === "cm" ? "cm" : "mm")}
      {t.notas && (
        <text x={MARGIN + 2} y={H - MARGIN - 3} fontSize={2.6}>
          {t.notas}
        </text>
      )}
    </g>
  );
}

// ── Tabla de despiece ────────────────────────────────────────────────

const T_FONT = 2.6;
const T_ROW = 5;

function tableColumns(t: SheetTable) {
  const cols: { key: string; label: string; w: number; align?: "end" }[] = [];
  if (t.showColors) cols.push({ key: "color", label: "", w: 6 });
  // La columna «Pieza» se ajusta al nombre más largo (≈0,5 de la altura de letra por carácter)
  const longest = Math.max(5, ...t.rows.map((r) => r.name.length));
  const nameW = Math.min(110, Math.max(32, longest * T_FONT * 0.5 + 2.4));
  cols.push({ key: "mark", label: "Marca", w: 11 }, { key: "name", label: "Pieza", w: nameW }, { key: "qty", label: "Cant.", w: 11, align: "end" });
  if (t.multiplier > 1) cols.push({ key: "total", label: `Total ×${t.multiplier}`, w: 16, align: "end" });
  cols.push({ key: "l", label: "Largo", w: 15, align: "end" }, { key: "w", label: "Ancho", w: 15, align: "end" }, { key: "t", label: "Esp.", w: 13, align: "end" });
  return cols;
}

/** Tamaño de la tabla sobre el papel: [ancho, alto] en mm. */
export function tableSize(t: SheetTable): Vec2 {
  return [tableColumns(t).reduce((a, c) => a + c.w, 0), T_ROW * (t.rows.length + 2)];
}

function PieceTable({ t, data, selected, onPointerDown }: { t: SheetTable; data: SheetData; selected: boolean; onPointerDown?: (e: React.PointerEvent) => void }) {
  const cols = tableColumns(t);
  const [w, h] = tableSize(t);
  const fmt = (mm: number) => formatLength(mm, data.unit, data.decimals);
  const stroke = selected ? "#1c7ed6" : "black";
  // borde izquierdo de cada columna
  const xs = cols.map((_, i) => t.x + cols.slice(0, i).reduce((a, c) => a + c.w, 0));
  const cellText = (ci: number, y: number, text: string, bold = false) => {
    const c = cols[ci];
    const x = c.align === "end" ? xs[ci] + c.w - 1.2 : xs[ci] + 1.2;
    return (
      <text key={`${c.key}-${y}`} x={x} y={y + T_ROW - 1.5} fontSize={T_FONT} fontWeight={bold ? 700 : 400} textAnchor={c.align === "end" ? "end" : "start"}>
        {text}
      </text>
    );
  };
  return (
    <g data-table={t.id} style={onPointerDown ? { cursor: "move" } : undefined} onPointerDown={onPointerDown}>
      <rect x={t.x} y={t.y} width={w} height={h} fill="white" stroke={stroke} strokeWidth={0.35} />
      <text x={t.x + 1.2} y={t.y + T_ROW - 1.4} fontSize={T_FONT + 0.4} fontWeight={700}>
        {t.title.toUpperCase()}
      </text>
      <text x={t.x + w - 1.2} y={t.y + T_ROW - 1.4} fontSize={T_FONT - 0.4} textAnchor="end" fill="#555">
        medidas en {data.unit}
      </text>
      <line x1={t.x} y1={t.y + T_ROW} x2={t.x + w} y2={t.y + T_ROW} stroke={stroke} strokeWidth={0.25} />
      {cols.map((c, ci) => (c.label ? cellText(ci, t.y + T_ROW, c.label, true) : null))}
      <line x1={t.x} y1={t.y + 2 * T_ROW} x2={t.x + w} y2={t.y + 2 * T_ROW} stroke={stroke} strokeWidth={0.25} />
      {xs.slice(1).map((x) => (
        <line key={x} x1={x} y1={t.y + T_ROW} x2={x} y2={t.y + h} stroke={stroke} strokeWidth={0.15} />
      ))}
      {t.rows.map((r, ri) => {
        const y = t.y + T_ROW * (ri + 2);
        const vals: Record<string, string> = {
          mark: r.mark,
          name: r.name,
          qty: String(r.qty),
          total: String(r.qty * t.multiplier),
          l: fmt(r.dims[0]),
          w: fmt(r.dims[1]),
          t: fmt(r.dims[2]),
        };
        return (
          <g key={r.mark}>
            {ri > 0 && <line x1={t.x} y1={y} x2={t.x + w} y2={y} stroke="#999" strokeWidth={0.1} />}
            {cols.map((c, ci) =>
              c.key === "color" ? (
                <rect key="color" x={xs[ci] + 1.2} y={y + 1} width={c.w - 2.4} height={T_ROW - 2} fill={r.color} stroke="black" strokeWidth={0.1} />
              ) : (
                cellText(ci, y, vals[c.key], c.key === "mark")
              ),
            )}
          </g>
        );
      })}
    </g>
  );
}

export type SheetSvgProps = {
  data: SheetData;
  className?: string;
  /** Tamaño real en mm (para imprimir) en vez de ajustarse al contenedor */
  print?: boolean;
  selected?: string | null;
  svgRef?: React.Ref<SVGSVGElement>;
  viewBox?: [number, number, number, number];
  onViewPointerDown?: (e: React.PointerEvent, view: SheetView) => void;
  onDimPointerDown?: (e: React.PointerEvent, dim: SheetDim) => void;
  onTextPointerDown?: (e: React.PointerEvent, id: string) => void;
  onTablePointerDown?: (e: React.PointerEvent, table: SheetTable) => void;
  svgProps?: React.SVGProps<SVGSVGElement>;
  children?: React.ReactNode;
};

export function SheetSvg({
  data,
  className,
  print,
  selected,
  svgRef,
  viewBox,
  onViewPointerDown,
  onDimPointerDown,
  onTextPointerDown,
  onTablePointerDown,
  svgProps,
  children,
}: SheetSvgProps) {
  const [W, H] = sheetSize(data);
  const st = styleOf(data);
  const vb = viewBox ?? [0, 0, W, H];
  const views = new Map(data.views.map((v) => [v.id, v]));
  // El título de cada vista va debajo de la vista y de sus cotas
  const labelY = new Map<string, number>();
  for (const v of data.views) {
    const [, ry, , rh] = viewRect(v);
    labelY.set(v.id, ry + rh);
  }
  for (const d of data.dims) {
    const v = views.get(d.viewId);
    const s = v && dimShape(v, d, data);
    if (!v || !s) continue;
    const ys = [...s.lines.matchAll(/[ML][-\d.e]+ ([-\d.e]+)/g)].map((m) => Number(m[1]));
    labelY.set(v.id, Math.max(labelY.get(v.id)!, ...ys, s.text.y + 1));
  }
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={vb.join(" ")}
      width={print ? `${W}mm` : undefined}
      height={print ? `${H}mm` : undefined}
      className={className}
      fontFamily="'Arial Narrow', Arial, Helvetica, sans-serif"
      {...svgProps}
    >
      <rect x={0} y={0} width={W} height={H} fill="white" />
      <rect x={MARGIN} y={MARGIN} width={W - 2 * MARGIN} height={H - 2 * MARGIN} fill="none" stroke="black" strokeWidth={0.5} />

      {data.views.map((view) => {
        const [rx, ry, rw, rh] = viewRect(view);
        const isSel = selected === view.id;
        return (
          <g key={view.id} data-view={view.id}>
            {onViewPointerDown && (
              <rect
                x={rx - 2}
                y={ry - 2}
                width={rw + 4}
                height={rh + 4}
                fill="transparent"
                stroke={isSel ? "#1c7ed6" : "transparent"}
                strokeWidth={0.3}
                strokeDasharray="2 1"
                style={{ cursor: "move" }}
                onPointerDown={(e) => onViewPointerDown(e, view)}
              />
            )}
            {view.fill && <image href={view.fill} x={rx} y={ry} width={rw} height={rh} preserveAspectRatio="none" pointerEvents="none" />}
            {view.showHidden && view.hidden.length > 0 && (
              <path
                d={segmentsPath(view, view.hidden)}
                fill="none"
                stroke="black"
                strokeWidth={st.lineHidden}
                strokeDasharray={`${(st.lineHidden * 8).toFixed(2)} ${(st.lineHidden * 4.5).toFixed(2)}`}
                pointerEvents="none"
              />
            )}
            <path d={segmentsPath(view, view.visible)} fill="none" stroke="black" strokeWidth={st.lineVisible} strokeLinecap="round" pointerEvents="none" />
            {view.label && (
              <text x={view.x} y={(labelY.get(view.id) ?? ry + rh) + 6} fontSize={3.2} textAnchor="middle" fontWeight={600} pointerEvents="none">
                {view.label.toUpperCase()}
                {` · 1:${view.scale}`}
              </text>
            )}
          </g>
        );
      })}

      {data.dims.map((dim) => {
        const view = views.get(dim.viewId);
        const s = view && dimShape(view, dim, data);
        if (!s) return null;
        const color = selected === dim.id ? "#1c7ed6" : data.dimColor;
        return (
          <g key={dim.id} data-dim={dim.id}>
            <path d={s.lines} fill="none" stroke={color} strokeWidth={st.dimLine} />
            <path d={s.arrows} fill={color} stroke="none" />
            <text
              x={s.text.x}
              y={s.text.y}
              fontSize={st.dimText}
              fontWeight={700}
              fill={color}
              textAnchor="middle"
              transform={`rotate(${s.text.angle} ${s.text.x} ${s.text.y})`}
            >
              {s.text.value}
            </text>
            {onDimPointerDown && (
              <path
                d={s.hit}
                stroke="transparent"
                strokeWidth={3}
                fill="none"
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => onDimPointerDown(e, dim)}
              />
            )}
          </g>
        );
      })}

      {data.texts.map((t) => (
        <text
          key={t.id}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          fill={selected === t.id ? "#1c7ed6" : "black"}
          style={onTextPointerDown ? { cursor: "move" } : undefined}
          onPointerDown={onTextPointerDown ? (e) => onTextPointerDown(e, t.id) : undefined}
        >
          {t.text}
        </text>
      ))}

      {(data.tables ?? []).map((t) => (
        <PieceTable
          key={t.id}
          t={t}
          data={data}
          selected={selected === t.id}
          onPointerDown={onTablePointerDown ? (e) => onTablePointerDown(e, t) : undefined}
        />
      ))}

      <TitleBlock data={data} />
      {children}
    </svg>
  );
}
