import { Sidebar } from "@/components/Sidebar";

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden md:h-screen md:max-h-none">
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
      <Sidebar />
    </div>
  );
}
