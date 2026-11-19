import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Movie — İkiniz için sıradaki film",
  description: "İki kişinin Letterboxd verilerini analiz edip birlikte izlenecek sıradaki filmi önerir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
