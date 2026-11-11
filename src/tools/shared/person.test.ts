import { describe, it, expect } from "vitest";
import { personKey, personTag, tenantOf } from "./person";
import { userStoreFile } from "./store";
import { permissionFlag } from "../registry";

describe("people are keyed by school and user", () => {
  it("treats a missing or bad tenant as tenant 1", () => {
    expect(tenantOf({ userId: 7 })).toBe(1);
    expect(tenantOf({ userId: 7, tid: null })).toBe(1);
    expect(tenantOf({ userId: 7, tid: 0 })).toBe(1);
    expect(tenantOf({ userId: 7, tid: 4 })).toBe(4);
  });

  it("gives the same user id in two schools different keys", () => {
    expect(personKey({ userId: 7 })).toBe("1:7");
    expect(personKey({ userId: 7, tid: 4 })).toBe("4:7");
    expect(personTag({ userId: 7, tid: 4 })).not.toBe(personTag({ userId: 7, tid: 1 }));
  });

  it("keeps tenant 1's file names from before multi-tenancy", () => {
    expect(userStoreFile({ userId: 7 })).toBe("tools-u7.json");
    expect(userStoreFile({ userId: 7, tid: 1 })).toBe("tools-u7.json");
    expect(userStoreFile({ userId: 7, tid: 4 })).toBe("tools-t4-u7.json");
    expect(permissionFlag("translations", { userId: 7 })).toBe("nga.tools.can.translations.7");
    expect(permissionFlag("translations", { userId: 7, tid: 4 })).toBe("nga.tools.can.translations.t4-u7");
  });
});
