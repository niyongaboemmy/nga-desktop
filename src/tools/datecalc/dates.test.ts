import { describe, expect, it } from "vitest";
import { addDays, addWorkingDays, difference, easter, parse, rwandaHolidays, today } from "./dates";

describe("dates", () => {
  it("knows Easter", () => {
    expect(easter(2024)).toBe("2024-03-31");
    expect(easter(2025)).toBe("2025-04-20");
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
  });

  it("lists Rwanda's public holidays for 2026", () => {
    const h = rwandaHolidays(2026).map((x) => x.date);
    expect(h).toContain("2026-02-01");
    expect(h).toContain("2026-04-03"); // Good Friday
    expect(h).toContain("2026-04-06"); // Easter Monday
    expect(h).toContain("2026-04-07");
    expect(h).toContain("2026-07-04");
    expect(h).toContain("2026-08-07"); // Umuganura: first Friday of August
    expect(h).toEqual([...h].sort());
    expect(rwandaHolidays(2026).filter((x) => x.approximate)).toHaveLength(2);
  });

  it("Umuganura is always the first Friday of August", () => {
    for (let y = 2024; y <= 2035; y++) {
      const d = rwandaHolidays(y).find((x) => x.name === "hol.umuganura")!.date;
      const t = new Date(d + "T00:00:00Z");
      expect(t.getUTCDay(), d).toBe(5);
      expect(t.getUTCDate(), d).toBeLessThanOrEqual(7);
    }
  });

  it("rejects impossible dates", () => {
    expect(parse("2026-02-30")).toBeNull();
    expect(parse("2026-13-01")).toBeNull();
    expect(parse("05/10/2026")).toBeNull();
    expect(parse("2028-02-29")).not.toBeNull();
  });

  it("counts days, weeks and working days", () => {
    // Mon 5 Oct 2026 → Fri 16 Oct 2026: 11 days, 10 working days (both dates counted).
    const d = difference("2026-10-05", "2026-10-16")!;
    expect(d.days).toBe(11);
    expect([d.weeks, d.restDays]).toEqual([1, 4]);
    expect(d.workingDays).toBe(10);
    expect(d.weekendDays).toBe(2);
  });

  it("skips public holidays in working days", () => {
    // Week of Liberation Day 2025 (Fri 4 July): Mon 30 Jun – Fri 4 Jul has 1 Jul and 4 Jul off.
    const d = difference("2025-06-30", "2025-07-04")!;
    expect(d.workingDays).toBe(3);
    expect(d.holidays).toBe(2);
  });

  it("works backwards too", () => {
    expect(difference("2026-10-16", "2026-10-05")!.days).toBe(-11);
  });

  it("adds days across months and leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("bad", 1)).toBeNull();
  });

  it("adds working days, skipping weekends and holidays", () => {
    expect(addWorkingDays("2026-10-09", 1)).toBe("2026-10-12"); // Fri → Mon
    expect(addWorkingDays("2026-12-24", 1)).toBe("2026-12-28"); // skips 25, 26 and the weekend
    expect(addWorkingDays("2026-10-12", -1)).toBe("2026-10-09");
    expect(addWorkingDays("2026-10-05", 0)).toBe("2026-10-05");
  });

  it("today is local YYYY-MM-DD", () => {
    expect(today(new Date(2026, 9, 5, 23, 30))).toBe("2026-10-05");
  });
});
