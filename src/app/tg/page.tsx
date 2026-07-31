import type { Metadata } from "next";
import { TelegramMiniAppShell } from "@/components/TelegramMiniAppShell";

export const metadata: Metadata = {
  title: "Зеркало Дао | Telegram",
  description: "Интерактивное пространство Зеркала Дао внутри Telegram"
};

export default function TelegramPage() {
  return <TelegramMiniAppShell />;
}

