const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
const allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
  .split(/[\s,;]+/)
  .filter(Boolean)
  .map((candidate) => Number(candidate));
const menuText = process.env.TELEGRAM_MENU_BUTTON_TEXT?.trim() || "Открыть Зеркало";
const menuUrl = process.argv[2]?.trim() || (appUrl ? `${appUrl}/tg` : "");

if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required");
if (!menuUrl || !/^https:\/\//i.test(menuUrl)) {
  throw new Error("Pass an HTTPS Mini App URL or configure NEXT_PUBLIC_APP_URL");
}
if (allowedUserIds.length === 0) {
  throw new Error("TELEGRAM_ALLOWED_USER_IDS must contain at least one Telegram user ID");
}
if (allowedUserIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
  throw new Error("TELEGRAM_ALLOWED_USER_IDS contains an invalid Telegram user ID");
}

async function setChatMenuButton(payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram Bot API failed with ${response.status}`);
  }
}

// Remove the global Mini App entry first. Telegram will show its normal command
// menu for everyone who does not have a private-chat override.
await setChatMenuButton({ menu_button: { type: "commands" } });

for (const chatId of new Set(allowedUserIds)) {
  await setChatMenuButton({
    chat_id: chatId,
    menu_button: {
      type: "web_app",
      text: menuText,
      web_app: { url: menuUrl },
    },
  });
}

console.log(JSON.stringify({
  defaultMenu: "commands",
  personalizedWebAppMenus: new Set(allowedUserIds).size,
  webAppUrl: menuUrl,
}, null, 2));
