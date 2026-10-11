import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/hooks/useI18n";
import { isRuoyiIntegrationEnabled } from "@/lib/ruoyi-identity";

export default function Home() {
  const isRuoyiIntegration = isRuoyiIntegrationEnabled();
  return (
    <Suspense>
      <I18nProvider>
        <AppShell isRuoyiIntegration={isRuoyiIntegration} />
      </I18nProvider>
    </Suspense>
  );
}
