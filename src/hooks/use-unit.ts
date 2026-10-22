"use client";

import { useEffect, useState } from "react";

/** Unidad de visualización de las cotas, recordada en este navegador. */
export function useUnit() {
  const [unit, setUnitState] = useState<"mm" | "cm">("cm");
  useEffect(() => {
    try {
      const u = localStorage.getItem("cotas:unit");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en el navegador
      if (u === "mm" || u === "cm") setUnitState(u);
    } catch {}
  }, []);
  const setUnit = (u: "mm" | "cm") => {
    setUnitState(u);
    try {
      localStorage.setItem("cotas:unit", u);
    } catch {}
  };
  return [unit, setUnit] as const;
}
