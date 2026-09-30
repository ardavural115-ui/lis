// Kanal Web-Chat. Das Widget fragt neue Nachrichten selbst ab (Polling),
// deshalb gibt es beim Zustellen nichts zu tun.
//
// Weitere Kanäle (später): whatsapp.ts nimmt Webhooks von Meta entgegen, ruft
// engine.handleMessage auf und schickt Antworten über die WhatsApp Cloud API.

import type { Channel } from "../types.ts";

export const webChannel: Channel = {
  id: "web",
  async deliver() {},
};
