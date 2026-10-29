export const metadata = { title: "Datenschutz – BiatiCheck" };

// VOR LIVEGANG durch Datenschutzbeauftragten/Anwalt prüfen lassen. Technische Fakten unten entsprechen der Implementierung.
export default function Datenschutz() {
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-bold">Datenschutz</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Die vollständige Datenschutzerklärung folgt vor dem Livegang.</p>
      <h2 className="text-lg font-semibold">So gehen wir mit Ihrer Abrechnung um</h2>
      <ul className="list-disc space-y-1 pl-5 text-stone-700">
        <li>Ihre Abrechnung wird verschlüsselt gespeichert und nach 90 Tagen automatisch gelöscht.</li>
        <li>Zum Auslesen wird das Dokument an einen KI-Dienstleister übermittelt (Auftragsverarbeitung).</li>
        <li>Für die Prüfung übernehmen wir keine Namen, Adressen oder Kontodaten in unsere Datenbank.</li>
        <li>Zugang zu Ihrer Prüfung haben nur Sie über Ihren persönlichen Link sowie unsere Experten.</li>
      </ul>
    </article>
  );
}
