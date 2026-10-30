export const metadata = { title: "Datenschutz – BiatiCheck" };

// VOR LIVEGANG durch Datenschutzbeauftragten/Anwalt prüfen lassen. Technische Fakten unten entsprechen der Implementierung.
export default function Datenschutz() {
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-14">
      <h1 className="text-3xl font-bold">Datenschutz</h1>
      <p className="rounded-xl bg-warn p-3.5 text-warn-text">Die vollständige Datenschutzerklärung folgt vor dem Livegang.</p>
      <h2 className="text-xl font-semibold">So gehen wir mit Ihrer Abrechnung um</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-gedaempft">
        <li>Ihre Abrechnung wird verschlüsselt gespeichert und nach 90 Tagen automatisch gelöscht.</li>
        <li>Zum Auslesen wird das Dokument an einen KI-Dienstleister übermittelt (Auftragsverarbeitung).</li>
        <li>Für die Prüfung übernehmen wir keine Namen, Adressen oder Kontodaten in unsere Datenbank.</li>
        <li>Zugang zu Ihrer Prüfung haben nur Sie über Ihren persönlichen Link sowie unsere Experten.</li>
        <li>Die Schrift wird von unserem Server geladen – beim Besuch der Seite werden keine Daten an Google übertragen.</li>
      </ul>
    </article>
  );
}
