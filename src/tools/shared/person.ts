// A person is a user in a school (tenant): MIS user ids repeat across schools,
// so everything kept for someone is keyed by both (src-tauri/src/tenancy.rs).
// No tenant id (an older MIS, data from before multi-tenancy) = tenant 1, whose
// names stay as they were so existing files carry over.
import type { Identity } from "../types";

export type Person = Pick<Identity, "userId"> & { tid?: number | null };

export const PRIMARY_TID = 1;

export const tenantOf = (p: Person): number => {
  const t = Number(p.tid);
  return Number.isInteger(t) && t > 0 ? t : PRIMARY_TID;
};

/** `<tid>:<userId>`: the person's key in shared maps and caches. */
export const personKey = (p: Person): string => `${tenantOf(p)}:${Math.trunc(p.userId)}`;

/** The person's part of a file or storage key: `u<id>` in tenant 1, `t<tid>-u<id>` elsewhere (Rust `Account::file_tag`). */
export const personTag = (p: Person): string => {
  const tid = tenantOf(p);
  const u = `u${Math.trunc(p.userId)}`;
  return tid === PRIMARY_TID ? u : `t${tid}-${u}`;
};
