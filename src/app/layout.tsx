import type { Metadata } from "next";
import { PortalShell } from "@/components/portal-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Clan Portal", template: "%s · Clan Portal" },
  description: "Единое пространство клана: коллективы, ресурсы, предметы и крафт.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <PortalShell>{children}</PortalShell>
      </body>
    </html>
  );
}
