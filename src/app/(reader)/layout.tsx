import { ReaderLayoutClient } from "@/app/(reader)/ReaderLayoutClient";

export default function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReaderLayoutClient>{children}</ReaderLayoutClient>;
}
