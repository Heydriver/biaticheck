/** Der Prüfbereich: immer hell, breit genug für Dokument und Editor nebeneinander. */
export default function InternBreite({ children }: { children: React.ReactNode }) {
  return (
    <div className="immer-hell min-h-dvh">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6">{children}</div>
    </div>
  );
}
