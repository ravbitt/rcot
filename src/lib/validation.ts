import { z } from "zod";

const num = z.number().finite();
export const vec3 = z.tuple([num, num, num]);
export const vec2 = z.tuple([num, num]);

export const dimensionInput = z.object({
  a: vec3,
  b: vec3,
  offset: vec3,
  axis: z.enum(["aligned", "x", "y", "z"]),
  label: z.string().trim().max(80).nullable().optional(),
});

export const dimensionPatch = z.object({
  offset: vec3.optional(),
  axis: z.enum(["aligned", "x", "y", "z"]).optional(),
  label: z.string().trim().max(80).nullable().optional(),
});

const view = z.object({
  id: z.string().max(40),
  kind: z.enum(["iso", "iso-back", "front", "back", "left", "right", "top"]),
  scale: z.number().positive().max(1000),
  x: num,
  y: num,
  showHidden: z.boolean(),
  visible: z.array(num).max(400_000),
  hidden: z.array(num).max(400_000),
  bounds: z.tuple([num, num, num, num]),
  label: z.string().max(80),
  fill: z
    .string()
    .max(6_000_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .nullable()
    .optional(),
  explode: z.number().min(0).max(5).optional(),
  marksColored: z.boolean().optional(),
});

const pieceRow = z.object({
  mark: z.string().max(8),
  name: z.string().max(200),
  qty: z.number().int().min(1).max(100000),
  dims: z.tuple([num, num, num]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const table = z.object({
  id: z.string().max(40),
  x: num,
  y: num,
  title: z.string().max(80),
  showColors: z.boolean(),
  multiplier: z.number().int().min(1).max(10000),
  scale: z.number().min(0.3).max(5).optional(),
  rows: z.array(pieceRow).max(500),
});

const style = z.object({
  dimText: z.number().min(0.5).max(20),
  dimLine: z.number().min(0.05).max(2),
  dimArrow: z.number().min(0.5).max(15),
  lineVisible: z.number().min(0.05).max(2),
  lineHidden: z.number().min(0.05).max(2),
  // ausente en planos guardados antes de las claves
  markSize: z.number().min(1).max(20).default(3.4),
});

const dim2d = z.object({
  id: z.string().max(40),
  viewId: z.string().max(40),
  kind: z.enum(["linear", "radius", "diameter", "arc", "angle"]).optional(),
  a: vec2,
  b: vec2,
  c: vec2.optional(),
  p: vec2.optional(),
  orient: z.enum(["h", "v", "aligned"]),
  offset: num,
  text: z.string().max(80).nullable(),
});

export const sheetData = z.object({
  version: z.literal(1),
  size: z.enum(["A4", "A3", "A2", "A1"]),
  unit: z.enum(["mm", "cm"]),
  decimals: z.number().int().min(0).max(3),
  dimColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  style: style.optional(),
  tables: z.array(table).max(10).optional(),
  marks: z
    .array(
      z.object({
        id: z.string().max(40),
        viewId: z.string().max(40),
        mark: z.string().max(8),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        anchor: vec2,
        pos: vec2,
      }),
    )
    .max(2000)
    .optional(),
  views: z.array(view).max(24),
  dims: z.array(dim2d).max(2000),
  texts: z.array(z.object({ id: z.string().max(40), x: num, y: num, text: z.string().max(500), size: num })).max(200),
  title: z.object({
    proyecto: z.string().max(120),
    cliente: z.string().max(120),
    plano: z.string().max(120),
    cantidad: z.string().max(40),
    dibujo: z.string().max(120),
    fecha: z.string().max(40),
    notas: z.string().max(500),
  }),
});

export const sheetInput = z.object({ name: z.string().trim().min(1).max(120), data: sheetData });
