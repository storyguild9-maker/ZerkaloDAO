"use client";

import { useState } from "react";

type Props = {
  copyText: string;
  downloadHref: string;
};

export function ResultActions({ copyText, downloadHref }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyResult() {
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={copyResult} className="dao-action px-5 py-3">
        {copied ? "Скопировано" : "Скопировать результат"}
      </button>
      <a href={downloadHref} download className="dao-action px-5 py-3 text-center">
        Скачать JSON
      </a>
    </div>
  );
}
