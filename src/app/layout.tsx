import type { Metadata } from "next";
import { PortalShell } from "@/components/portal-shell";
import { DEFAULT_PORTAL_NAME } from "@/lib/portal-branding";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: DEFAULT_PORTAL_NAME, template: `%s · ${DEFAULT_PORTAL_NAME}` },
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
