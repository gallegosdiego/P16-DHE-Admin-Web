"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return window.navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (online) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-[90] bg-amber-500 px-3 py-2 text-center text-xs font-semibold text-slate-900">
      Sin conexion a internet - los datos pueden no estar actualizados
    </div>
  );
}
