import { Hochladen } from "@/komponenten/Hochladen";

const SCHRITTE = [
  ["Hochladen", "PDF oder Foto Ihrer Nebenkostenabrechnung – inklusive Heizkostenabrechnung."],
  ["Automatisch prüfen", "Über 20 Prüfregeln: Fristen, Rechenwege, umlagefähige Kosten, Heizkostenverordnung, CO₂-Aufteilung."],
  ["Ergebnis erhalten", "Kostenlose Erstauswertung. Auf Wunsch ausführlicher Bericht mit Erklärungen und nächsten Schritten."],
] as const;

export default function Startseite() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Ist Ihre Nebenkostenabrechnung korrekt?</h1>
        <p className="text-lg text-stone-600">
          Viele Abrechnungen enthalten Fehler oder nicht umlagefähige Kosten. BiatiCheck prüft Ihre Abrechnung nach den Regeln
          unserer Experten – kostenlos in der Erstauswertung.
        </p>
      </section>

      <Hochladen />

      <section aria-labelledby="ablauf" className="space-y-4">
        <h2 id="ablauf" className="text-xl font-semibold">
          So funktioniert&apos;s
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {SCHRITTE.map(([titel, text], i) => (
            <li key={titel} className="rounded-xl border border-stone-200 bg-white p-4">
              <span className="text-sm font-semibold text-marke-600">Schritt {i + 1}</span>
              <h3 className="mt-1 font-semibold">{titel}</h3>
              <p className="mt-1 text-sm text-stone-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-stone-500">
        BiatiCheck prüft Ihre Abrechnung rechnerisch und anhand allgemeiner Regeln. Die Auswertung ersetzt keine Rechtsberatung im
        Einzelfall.
      </p>
    </div>
  );
}
