import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

// Public marketing/flow pages share one chrome: a full-height column with the
// site Header and Footer rendered once. Pages render their content as a flex-1
// child so the footer stays pinned to the bottom on short pages.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-warm-white flex min-h-screen flex-col">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
