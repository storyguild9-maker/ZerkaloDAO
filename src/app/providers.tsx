"use client";

import type { ReactNode } from "react";
import { THEME, TonConnectUIProvider } from "@tonconnect/ui-react";

const TONCONNECT_MANIFEST_URL = "https://zerkalo-dao.vercel.app/tonconnect-manifest.json";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TonConnectUIProvider
      actionsConfiguration={{
        returnStrategy: "back",
        twaReturnUrl: "https://t.me/DLAN_rubot"
      }}
      language="ru"
      manifestUrl={TONCONNECT_MANIFEST_URL}
      restoreConnection
      uiPreferences={{
        borderRadius: "s",
        theme: THEME.DARK
      }}
    >
      {children}
    </TonConnectUIProvider>
  );
}
