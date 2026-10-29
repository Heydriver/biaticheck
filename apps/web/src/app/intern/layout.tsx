/** Der Prüfbereich braucht Platz für Dokument und Editor nebeneinander. */
export default function InternBreite({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1600px] px-4 py-6">{children}</div>;
}
