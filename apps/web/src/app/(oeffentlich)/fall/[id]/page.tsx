import type { Metadata } from "next";
import { FallSeite } from "@/komponenten/FallSeite";

export const metadata: Metadata = { title: "Ihre Prüfung – BiatiCheck", robots: { index: false, follow: false } };

export default async function Fall({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <FallSeite id={id} />
    </div>
  );
}
