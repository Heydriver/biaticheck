import { ALLE_REGELN } from "@biaticheck/pruefkern";
import { ErklaerVideo } from "@/komponenten/ErklaerVideo";
import { HeldSzene } from "@/komponenten/HeldSzene";
import { Hochladen } from "@/komponenten/Hochladen";

const LAUFBAND = [
  ["§ 556 BGB", "Abrechnungsfrist 12 Monate"],
  ["§ 2 BetrKV", "17 umlagefähige Kostenarten"],
  ["HeizkostenV", "50–70 % nach Verbrauch"],
  ["CO2KostAufG", "Stufenmodell für CO₂-Kosten"],
  ["§ 230 TKG", "Kabel-TV nur bis 30.06.2024"],
  ["§ 556a BGB", "Verteilung nach Fläche oder Verbrauch"],
] as const;

const SCHRITTE = [
  ["Hochladen", "PDF oder Foto, inklusive Heizkostenabrechnung des Messdienstes."],
  ["Prüfen", "Die KI liest die Zahlen aus, feste Regeln rechnen nach. Unklares prüft ein Experte."],
  ["Ergebnis", "Kostenlose Erstauswertung. Auf Wunsch ausführlicher Bericht mit Erklärungen und nächsten Schritten."],
] as const;

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 justify-self-start rounded-full border border-gruen/30 bg-gruen/10 px-3.5 py-1.5 text-sm font-semibold text-gruen-tief before:size-[7px] before:rounded-full before:bg-gruen">
      {children}
    </span>
  );
}

export default function Startseite() {
  return (
    <>
      <section className="relative overflow-hidden" aria-labelledby="titel">
        <div className="pointer-events-none absolute -top-40 -left-44 size-[640px] rounded-full bg-[var(--nebel-1)] opacity-70 blur-[90px]" />
        <div className="pointer-events-none absolute top-32 -right-52 size-[720px] rounded-full bg-[var(--nebel-2)] opacity-70 blur-[90px]" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1.05fr_1fr] md:py-16">
          <div className="min-w-0">
            <Badge>Nebenkostenprüfung von Biati Solutions</Badge>
            <h1 id="titel" className="mt-5 text-[clamp(40px,6.4vw,76px)] leading-[1.02] font-extrabold">
              {/* Feste Trennstelle: am Handy „Nebenkosten-/abrechnung“ statt automatischer Silbentrennung */}
              Nebenkosten{"\u00AD"}abrechnung <span className="block text-gruen">sicher prüfen</span>
            </h1>
            <p className="mt-5 max-w-[34em] text-lg text-gedaempft">
              Laden Sie Ihre Abrechnung hoch. BiatiCheck rechnet jede Position nach, prüft Fristen und umlagefähige Kosten und zeigt Ihnen, was Sie
              klären sollten – nach den Regeln unserer Experten.
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <a href="#pruefen" className="inline-flex items-center gap-2 rounded-lg bg-gruen px-6 py-3.5 font-semibold text-white shadow-[0_14px_28px_-16px_rgba(31,163,126,0.8)] hover:bg-gruen-tief">
                Kostenlos prüfen <span aria-hidden="true">→</span>
              </a>
              <a href="#ablauf" className="inline-flex items-center rounded-lg border border-linie bg-grund px-6 py-3.5 font-semibold">
                So funktioniert&apos;s
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-linie pt-7">
              {[
                [String(ALLE_REGELN.length), "Prüfregeln aus BGB, BetrKV und HeizkostenV"],
                ["0 €", "für die Erstauswertung"],
                ["90 Tage", "dann wird Ihre Abrechnung gelöscht"],
              ].map(([wert, text]) => (
                <div key={text}>
                  <dt className="text-2xl font-bold sm:text-[26px]">{wert}</dt>
                  <dd className="text-sm text-gedaempft">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeldSzene anzahlRegeln={ALLE_REGELN.length} />
        </div>
      </section>

      <div className="overflow-hidden bg-gruen text-sm font-medium text-white" aria-hidden="true">
        <div className="laufband flex w-max gap-12 py-3">
          {[...LAUFBAND, ...LAUFBAND].map(([gesetz, text], i) => (
            <span key={i} className="whitespace-nowrap">
              <b className="mr-1.5 font-bold">{gesetz}</b>
              {text}
            </span>
          ))}
        </div>
      </div>

      <section id="ablauf" className="scroll-mt-20 bg-grund-alt py-20" aria-labelledby="ablauf-titel">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4">
          <div className="grid max-w-2xl gap-3.5">
            <Badge>In 25 Sekunden erklärt</Badge>
            <h2 id="ablauf-titel" className="text-[clamp(30px,4vw,46px)] leading-tight font-bold">
              Hochladen, prüfen, Ergebnis erhalten
            </h2>
          </div>
          <ErklaerVideo />
          <ol className="grid gap-5 md:grid-cols-3">
            {SCHRITTE.map(([titel, text], i) => (
              <li key={titel} className="grid content-start gap-2 rounded-2xl border border-linie bg-grund p-5">
                <span className="grid size-9 place-items-center rounded-full bg-gruen font-bold text-white">{i + 1}</span>
                <h3 className="text-lg font-bold">{titel}</h3>
                <p className="text-[15px] text-gedaempft">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="pruefen" className="scroll-mt-20 py-20" aria-labelledby="pruefen-titel">
        <div className="mx-auto grid w-full max-w-3xl gap-8 px-4">
          <div className="grid gap-3.5">
            <Badge>Kostenlose Erstauswertung</Badge>
            <h2 id="pruefen-titel" className="text-[clamp(30px,4vw,46px)] leading-tight font-bold">
              Abrechnung hochladen und prüfen lassen
            </h2>
            <p className="text-lg text-gedaempft">Sie erhalten einen persönlichen Link zu Ihrer Prüfung. Ein Konto brauchen Sie nicht.</p>
          </div>
          <Hochladen />
        </div>
      </section>

      <section id="regeln" className="scroll-mt-20 bg-grund-alt py-20" aria-labelledby="regeln-titel">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4">
          <div className="grid max-w-2xl gap-3.5">
            <Badge>Transparent</Badge>
            <h2 id="regeln-titel" className="text-[clamp(30px,4vw,46px)] leading-tight font-bold">
              Das prüft BiatiCheck
            </h2>
            <p className="text-lg text-gedaempft">Jede Regel hat eine feste ID und eine Rechtsgrundlage. So ist jedes Ergebnis nachvollziehbar.</p>
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {ALLE_REGELN.map((r) => (
              <li key={r.id} className="grid gap-1 rounded-xl border border-linie bg-grund px-4 py-3.5">
                <code className="font-mono text-xs text-gruen-tief">{r.id}</code>
                <b className="text-[15px] font-semibold">{r.titel}</b>
                <span className="text-[13px] text-gedaempft">{r.grundlage}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gedaempft">
            BiatiCheck prüft Ihre Abrechnung rechnerisch und anhand allgemeiner Regeln. Die Auswertung ersetzt keine Rechtsberatung im Einzelfall.
          </p>
        </div>
      </section>
    </>
  );
}
