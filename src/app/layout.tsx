import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { assetUrl } from "@/lib/assetUrl";
import "./globals.css";

export const metadata: Metadata = {
  title: "Проект Дао",
  description: "Главная страница проекта и интерактивный модуль Зеркало Дао"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const assetStyles = {
    "--dao-project-background": `url("${assetUrl("/images/dao-project-background.png")}")`,
    "--dao-intro-poster": `url("${assetUrl("/images/dao-intro-poster-4k.jpg")}")`,
    "--dao-inner-backdrop": `url("${assetUrl("/images/inner-council/final-inner-space-backdrop.png")}")`
  } as CSSProperties;
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js?63" />
      </head>
      <body style={assetStyles}>
        <div className="dao-video-backdrop" aria-hidden="true">
          <video
            className="dao-video-backdrop__media"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={assetUrl("/images/dao-intro-poster-4k.jpg")}
          >
            <source src={assetUrl("/videos/dao-intro-loop-4k-hq.mp4")} type="video/mp4" />
            <source src={assetUrl("/videos/dao-intro-loop-1080p.mp4")} type="video/mp4" />
          </video>
        </div><main className="min-h-screen px-5 py-8 sm:px-8">{children}</main>
      </body>
    </html>
  );
}





