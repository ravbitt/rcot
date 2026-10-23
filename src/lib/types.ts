// Tipos compartidos entre servidor y cliente.

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/** Cota alineada (distancia real entre los puntos) o proyectada sobre un eje del modelo. */
export type DimensionAxis = "aligned" | "x" | "y" | "z";

/** Cota 3D lineal, o de un arco que pasa por a, c (intermedio) y b: radio, diámetro o longitud de arco. */
export type DimensionKind = "linear" | "radius" | "diameter" | "arc";

export type Dimension = {
  id: string;
  /** Ausente = linear */
  kind?: DimensionKind;
  a: Vec3;
  b: Vec3;
  /** Punto intermedio del arco (radio, diámetro, arco) */
  c?: Vec3 | null;
  /** Lineal: punto por donde pasa la línea de cota. Arcos: dónde va el texto o la cota concéntrica */
  offset: Vec3;
  axis: DimensionAxis;
  label: string | null;
};

/** Malla de un cuerpo (pieza) del modelo, en mm. */
export type MeshBody = {
  name: string;
  /** Float32Array en base64: x,y,z por vértice */
  positions: string;
  /** Uint32Array en base64: tres índices por triángulo */
  indices: string;
};

export type MeshData = {
  version: 1;
  units: "mm";
  bodies: MeshBody[];
  bbox: [Vec3, Vec3];
};

// ── Planos ──────────────────────────────────────────────────────────────

export type SheetSize = "A4" | "A3" | "A2" | "A1";
export const SHEET_SIZES: Record<SheetSize, Vec2> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
};

export type ViewKind = "iso" | "iso-back" | "front" | "back" | "left" | "right" | "top";

/**
 * Vista proyectada del modelo. Las líneas se calculan en el navegador y se guardan con el plano
 * (coordenadas de la vista en mm del modelo, el eje v hacia arriba).
 */
export type SheetView = {
  id: string;
  kind: ViewKind;
  /** Denominador de la escala (10 = 1:10) */
  scale: number;
  /** Centro de la vista sobre la hoja, en mm de papel */
  x: number;
  y: number;
  showHidden: boolean;
  /** Segmentos visibles y ocultos: [u1, v1, u2, v2, …] en mm del modelo */
  visible: number[];
  hidden: number[];
  /** Caja de la vista en mm del modelo: [minU, minV, maxU, maxV] */
  bounds: [number, number, number, number];
  label: string;
  /** Relleno con el color de cada pieza (PNG en data URL que cubre exactamente `bounds`), o ausente */
  fill?: string | null;
  /** Factor de vista explosionada (0 o ausente = armado) */
  explode?: number;
  /** Claves (globos) con el color de su pieza; ausente = sí */
  marksColored?: boolean;
};

/** Clave de pieza: globo con la marca del despiece que apunta a un punto visible de la pieza. */
export type SheetMark = {
  id: string;
  viewId: string;
  mark: string;
  color: string;
  /** Punto de la pieza y centro del globo, en coordenadas de la vista (mm del modelo) */
  anchor: Vec2;
  pos: Vec2;
};

export type SheetDimOrient = "h" | "v" | "aligned";

/**
 * Tipo de cota 2D:
 * - linear: entre `a` y `b` (horizontal, vertical o alineada según `orient`, línea a `offset`).
 * - radius / diameter: arco que pasa por `a`, `c` y `b`; el texto va en `p`.
 * - arc: longitud del arco de `a` a `b` pasando por `c`; la cota concéntrica pasa por `p`.
 * - angle: ángulo en el vértice `a` entre las semirrectas hacia `b` y `c`; el arco de cota pasa por `p`.
 */
export type SheetDimKind = "linear" | "radius" | "diameter" | "arc" | "angle";

/** Cota 2D sobre una vista: los puntos están en coordenadas de la vista (mm del modelo). */
export type SheetDim = {
  id: string;
  viewId: string;
  /** Ausente = linear (cotas creadas antes de los otros tipos) */
  kind?: SheetDimKind;
  a: Vec2;
  b: Vec2;
  /** Tercer punto (arcos y ángulos) */
  c?: Vec2;
  /** Ubicación del texto o de la línea de cota (arcos y ángulos) */
  p?: Vec2;
  orient: SheetDimOrient;
  /** Distancia de la línea de cota a los puntos, en mm del modelo (con signo) */
  offset: number;
  text: string | null;
};

export type SheetText = { id: string; x: number; y: number; text: string; size: number };

export type TitleBlock = {
  proyecto: string;
  cliente: string;
  plano: string;
  cantidad: string;
  dibujo: string;
  fecha: string;
  notas: string;
};

/** Grosores y tamaños de la lámina, en mm de papel. */
export type SheetStyle = {
  dimText: number;
  dimLine: number;
  dimArrow: number;
  lineVisible: number;
  lineHidden: number;
  /** Altura de la letra de las claves (el globo es un poco mayor) */
  markSize: number;
};

export const DEFAULT_STYLE: SheetStyle = { dimText: 3, dimLine: 0.18, dimArrow: 2.6, lineVisible: 0.35, lineHidden: 0.2, markSize: 3.4 };

/** Fila del despiece: un grupo de piezas iguales. Medidas en mm (largo ≥ ancho ≥ espesor). */
export type PieceRow = { mark: string; name: string; qty: number; dims: [number, number, number]; color: string };

/** Tabla de despiece sobre la hoja (esquina superior izquierda en x, y). */
export type SheetTable = {
  id: string;
  x: number;
  y: number;
  title: string;
  showColors: boolean;
  /** Cantidad de módulos: multiplica la columna «Total» (1 = no se muestra) */
  multiplier: number;
  /** Tamaño de la tabla (1 = letra de 2,6 mm); ausente en tablas creadas antes */
  scale?: number;
  rows: PieceRow[];
};

export type SheetData = {
  version: 1;
  size: SheetSize;
  /** Unidad en que se muestran las cotas */
  unit: "mm" | "cm";
  decimals: number;
  dimColor: string;
  /** Ausente en planos creados antes: se usa DEFAULT_STYLE */
  style?: SheetStyle;
  views: SheetView[];
  dims: SheetDim[];
  texts: SheetText[];
  tables?: SheetTable[];
  marks?: SheetMark[];
  title: TitleBlock;
};

export function emptySheet(title: Partial<TitleBlock> = {}): SheetData {
  return {
    version: 1,
    size: "A3",
    unit: "cm",
    decimals: 1,
    dimColor: "#3f9b1c",
    style: { ...DEFAULT_STYLE },
    views: [],
    dims: [],
    texts: [],
    tables: [],
    title: { proyecto: "", cliente: "", plano: "", cantidad: "", dibujo: "", fecha: "", notas: "", ...title },
  };
}
