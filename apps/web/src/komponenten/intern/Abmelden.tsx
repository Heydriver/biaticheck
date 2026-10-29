"use client";

import { useRouter } from "next/navigation";

export function Abmelden() {
  const router = useRouter();
  return (
    <button
      className="rounded-md border border-marke-100/40 px-2 py-0.5 hover:bg-marke-700"
      onClick={async () => {
        await fetch("/api/intern/abmelden", { method: "POST" });
        router.replace("/intern/anmelden");
        router.refresh();
      }}
    >
      Abmelden
    </button>
  );
}
