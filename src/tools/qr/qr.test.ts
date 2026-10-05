import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { fileName, payload } from "./qr";

describe("QR payloads", () => {
  it("links get https:// when no scheme is typed", () => {
    expect(payload({ kind: "link", text: "mis.amashuri.com" })).toBe("https://mis.amashuri.com");
    expect(payload({ kind: "link", text: "http://x.rw/a" })).toBe("http://x.rw/a");
    expect(payload({ kind: "link", text: "mailto:a@b.rw" })).toBe("mailto:a@b.rw");
    expect(payload({ kind: "link", text: "  " })).toBe("");
  });

  it("Wi-Fi follows the standard format and escapes specials", () => {
    expect(payload({ kind: "wifi", text: "", ssid: "NGA Staff", password: "p;a:ss", security: "WPA" })).toBe(
      "WIFI:T:WPA;S:NGA Staff;P:p\\;a\\:ss;;",
    );
    expect(payload({ kind: "wifi", text: "", ssid: "Open", security: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Open;H:true;;");
    expect(payload({ kind: "wifi", text: "", ssid: "" })).toBe("");
  });

  it("contacts are vCards", () => {
    const v = payload({ kind: "contact", text: "", name: "Office", phone: "+250 788 000 000" });
    expect(v).toContain("BEGIN:VCARD");
    expect(v).toContain("FN:Office");
    expect(v).toContain("TEL:+250 788 000 000");
    expect(v).not.toContain("EMAIL");
  });

  it("makes a real QR image", async () => {
    const svg = await QRCode.toString(payload({ kind: "link", text: "mis.amashuri.com" }), { type: "svg" });
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("file names are safe and readable", () => {
    expect(fileName({ kind: "link", text: "https://mis.amashuri.com/apps" }, "png")).toBe("qr-mis-amashuri-com-apps.png");
    expect(fileName({ kind: "wifi", text: "", ssid: "NGA Staff" }, "svg")).toBe("qr-wifi-NGA-Staff.svg");
    expect(fileName({ kind: "text", text: "" }, "png")).toBe("qr-code.png");
  });
});
