"use client";

/** Schaltet zwischen hellem und dunklem Design um (wie auf biati.de) und merkt sich die Wahl. */
export function ThemaKnopf() {
  function umschalten() {
    const wurzel = document.documentElement;
    const jetztDunkel = wurzel.dataset.theme ? wurzel.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    wurzel.dataset.theme = jetztDunkel ? "light" : "dark";
    try {
      localStorage.setItem("bck-thema", wurzel.dataset.theme);
    } catch {
      // Speichern nicht möglich (z. B. privater Modus) – Umschalten funktioniert trotzdem
    }
    window.dispatchEvent(new Event("themawechsel"));
  }
  return (
    <button
      type="button"
      onClick={umschalten}
      aria-label="Hell- oder Dunkelmodus umschalten"
      className="grid size-10 place-items-center rounded-lg border border-linie text-text hover:border-gruen"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
