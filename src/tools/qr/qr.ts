// What goes inside a QR code, by kind.

export type QrKind = "link" | "text" | "wifi" | "contact";

export interface QrInput {
  kind: QrKind;
  text: string;
  ssid?: string;
  password?: string;
  security?: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
  name?: string;
  phone?: string;
  email?: string;
}

/** Wi-Fi QR strings escape \ ; , : and " with a backslash. */
const esc = (s: string) => s.replace(/([\;,:"])/g, "\\$1");

export function payload(i: QrInput): string {
  switch (i.kind) {
    case "link": {
      const t = i.text.trim();
      if (!t) return "";
      return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
    }
    case "text":
      return i.text;
    case "wifi": {
      if (!i.ssid?.trim()) return "";
      const sec = i.security ?? "WPA";
      const pass = sec === "nopass" ? "" : `P:${esc(i.password ?? "")};`;
      return `WIFI:T:${sec};S:${esc(i.ssid)};${pass}${i.hidden ? "H:true;" : ""};`;
    }
    case "contact": {
      if (!i.name?.trim() && !i.phone?.trim() && !i.email?.trim()) return "";
      const line = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${line(i.name ?? "")}`,
        i.phone?.trim() ? `TEL:${line(i.phone)}` : "",
        i.email?.trim() ? `EMAIL:${line(i.email)}` : "",
        "END:VCARD",
      ].filter(Boolean).join("\n");
    }
  }
}

/** A file name from what the code holds. */
export function fileName(i: QrInput, ext: "png" | "svg"): string {
  const base = (i.kind === "wifi" ? `wifi ${i.ssid ?? ""}` : i.kind === "contact" ? i.name ?? "contact" : i.text)
    .replace(/^https?:\/\//, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `qr-${base || "code"}.${ext}`;
}
