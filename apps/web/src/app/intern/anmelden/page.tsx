import type { Metadata } from "next";
import { Anmelden } from "@/komponenten/intern/Anmelden";

export const metadata: Metadata = { title: "Anmelden – BiatiCheck intern", robots: { index: false, follow: false } };

export default function AnmeldeSeite() {
  return <Anmelden />;
}
