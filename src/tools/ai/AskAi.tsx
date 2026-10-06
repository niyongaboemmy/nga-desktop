import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Flag, Info, LoaderCircle, MessageSquarePlus, RotateCcw, ShieldCheck, Sparkles, Square, WifiOff } from "lucide-react";
import { render } from "../notes/noteModel";
import { misCall, MisApiError } from "../shared/api";
import { usePersonal } from "../shared/store";
import { applyLine, newConversationId, providerName, suggestions, toRequest, trimTurns, turnId, type StreamLine, type Status, type Turn } from "./conversation";
import type { ToolProps } from "../types";
import type { Key, Translate } from "../i18n";

export default function AskAi({ ctx }: ToolProps) {
  const { t, identity } = ctx;
  const [turns, setTurns, ready] = usePersonal<Turn[]>(identity, "ai.turns", []);
  const [noticeSeen, setNoticeSeen] = usePersonal<boolean>(identity, "ai.noticeSeen", false);
  const [tutorNoticeSeen, setTutorNoticeSeen] = usePersonal<boolean>(identity, "ai.tutorNoticeSeen", false);
  const [conversationId, setConversationId] = usePersonal<string>(identity, "ai.conversationId", "");
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const loadStatus = useCallback(() => {
    setStatusError(null);
    misCall<Status>({ method: "GET", path: "/desktop/tools/ai/status", timeoutMs: 20_000 })
      .then((s) => setStatus(s))
      .catch((e: MisApiError) => setStatusError(e.message));
  }, []);

  useEffect(() => {
    loadStatus();
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      abort.current?.abort();
    };
  }, [loadStatus]);

  // Follow the answer while it's written, unless the person scrolled up to read.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const ask = useCallback(
    async (history: Turn[]) => {
      const answer: Turn = { id: turnId(), role: "assistant", content: "", streaming: true, at: Date.now() };
      setTurns(trimTurns([...history, answer]));
      setBusy(true);
      stick.current = true;
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        let conv = conversationIdRef.current;
        if (!conv) {
          conv = newConversationId();
          setConversationId(conv);
          conversationIdRef.current = conv;
        }
        await misCall({
          method: "POST",
          path: "/desktop/tools/ai/chat",
          body: { messages: toRequest(history), conversationId: conv },
          signal: ctrl.signal,
          onLine: (line) => {
            const l = line as StreamLine;
            setTurns((cur) => applyLine(cur, answer.id, l));
            if (typeof l.remaining === "number") setStatus((s) => (s ? { ...s, remaining: l.remaining! } : s));
          },
        });
        // A stream that ended without "done" (connection dropped) is finished as it is.
        setTurns((cur) => cur.map((x) => (x.id === answer.id && x.streaming ? { ...x, streaming: false, error: x.content ? undefined : t("ai.errEmpty") } : x)));
      } catch (e) {
        const err = e as MisApiError;
        const until = typeof err.data?.until === "string" ? new Date(err.data.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const label = typeof err.data?.label === "string" ? err.data.label : "";
        const msg =
          err.code === "ABORTED" ? null
          : err.code === "LOCKED_LESSON" ? t("tutor.lockedLesson", { label, time: until })
          : err.code === "LOCKED_EXAM" ? t("tutor.lockedExam", { label, time: until })
          : err.code === "TUTOR_OFF" ? t("tutor.off")
          : err.message;
        setTurns((cur) =>
          cur.map((x) => (x.id === answer.id ? { ...x, streaming: false, error: msg ?? (x.content ? undefined : t("ai.stopped")) } : x)),
        );
        if (err.code === "DAILY_LIMIT") setStatus((s) => (s ? { ...s, remaining: 0 } : s));
      } finally {
        setBusy(false);
        abort.current = null;
        input.current?.focus();
      }
    },
    [setTurns, setConversationId, t],
  );

  const send = (raw?: string) => {
    const q = (raw ?? text).trim();
    if (!q || busy) return;
    setText("");
    void ask([...turnsRef.current.filter((x) => !x.streaming), { id: turnId(), role: "user", content: q, at: Date.now() }]);
  };

  const regenerate = () => {
    const cur = turnsRef.current;
    const lastUser = cur.map((x) => x.role).lastIndexOf("user");
    if (lastUser < 0 || busy) return;
    void ask(cur.slice(0, lastUser + 1));
  };

  if (!ready) return null;
  if (!online) return <Empty icon={<WifiOff size={22} />} title={t("ai.offline")} body={t("ai.offlineBody")} />;
  if (statusError)
    return (
      <Empty icon={<Info size={22} />} title={t("ai.unreachable")} body={statusError}>
        <button className="btn sm" onClick={loadStatus}><RotateCcw size={14} /> {t("ai.retry")}</button>
      </Empty>
    );
  if (!status) return <div className="tool-loading"><LoaderCircle size={20} className="spin" /></div>;
  if (!status.available)
    return (
      <Empty
        icon={<Sparkles size={22} />}
        title={status.reason === "TUTOR_OFF" ? t("tutor.offTitle") : status.reason === "STUDENTS_SOON" ? t("ai.studentsSoon") : t("ai.parentsSoon")}
        body={status.reason === "TUTOR_OFF" ? t("tutor.off") : status.reason === "STUDENTS_SOON" ? t("ai.studentsSoonBody") : t("ai.parentsSoonBody")}
      />
    );
  const tutor = status.mode === "tutor";
  // Students read how the tutor works (saved, reviewed, no personal details) before the first question.
  if (tutor && !tutorNoticeSeen)
    return (
      <Empty icon={<ShieldCheck size={22} />} title={t("tutor.welcomeTitle")} body={t("tutor.welcome")}>
        <button className="btn primary" autoFocus onClick={() => setTutorNoticeSeen(true)}>{t("tutor.start")}</button>
      </Empty>
    );

  const last = turns[turns.length - 1];
  const out = status.remaining <= 0;
  return (
    <div className="ai">
      {!tutor && !noticeSeen && (
        <div className="ai-notice" role="note">
          <ShieldCheck size={16} />
          <span>{t("ai.notice")}</span>
          <button className="btn sm" onClick={() => setNoticeSeen(true)}>{t("ai.gotIt")}</button>
        </div>
      )}
      <div
        className="ai-thread"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {turns.length === 0 ? (
          <div className="ai-hello">
            <div className="ai-orb"><Sparkles size={22} /></div>
            <h3>{identity?.firstName ? t(tutor ? "tutor.helloName" : "ai.helloName", { name: identity.firstName }) : t(tutor ? "tutor.hello" : "ai.hello")}</h3>
            <p className="muted">{t(tutor ? "tutor.helloBody" : "ai.helloBody")}</p>
            <div className="ai-suggest">
              {suggestions(identity?.persona).map((k) => (
                <button key={k} onClick={() => send(t(k))} disabled={out}>{t(k)}</button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((x) => (
            <Bubble
              key={x.id}
              turn={x}
              t={t}
              tutor={tutor}
              canRegenerate={x === last && !busy && x.role === "assistant"}
              onRegenerate={regenerate}
              onReport={(reason) => {
                if (!x.messageId) return;
                void misCall({ method: "POST", path: "/desktop/tools/ai/report", body: { messageId: x.messageId, reason }, timeoutMs: 20_000 })
                  .then(() => setTurns((cur) => cur.map((y) => (y.id === x.id ? { ...y, reported: true } : y))))
                  .catch(() => undefined);
              }}
            />
          ))
        )}
      </div>
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          autoFocus
          rows={1}
          value={text}
          maxLength={8000}
          disabled={out}
          placeholder={out ? t("ai.limitReached") : t(tutor ? "tutor.placeholder" : "ai.placeholder")}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          aria-label={t(tutor ? "tutor.placeholder" : "ai.placeholder")}
        />
        {busy ? (
          <button type="button" className="ai-send stop" onClick={() => abort.current?.abort()} title={t("ai.stop")} aria-label={t("ai.stop")}><Square size={14} /></button>
        ) : (
          <button type="submit" className="ai-send" disabled={!text.trim() || out} title={t("ai.send")} aria-label={t("ai.send")}><ArrowUp size={17} /></button>
        )}
      </form>
      <div className="ai-foot">
        <span>{t("ai.left", { n: status.remaining, max: status.limit })}</span>
        <span className="flex" />
        {turns.length > 0 && !busy && (
          <button className="link-btn" onClick={() => { setTurns([]); setConversationId(""); }}><MessageSquarePlus size={13} /> {t("ai.newChat")}</button>
        )}
        <span className="muted">{t(tutor ? "tutor.footer" : "ai.disclaimer")}</span>
      </div>
    </div>
  );
}

function Bubble({ turn: x, t, tutor, canRegenerate, onRegenerate, onReport }: { turn: Turn; t: Translate; tutor: boolean; canRegenerate: boolean; onRegenerate: () => void; onReport: (reason: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [reporting, setReporting] = useState(false);
  const html = useMemo(() => (x.role === "assistant" && x.content ? render(x.content) : ""), [x.role, x.content]);
  if (x.role === "user") return <div className="ai-msg user"><div className="ai-bubble">{x.content}</div></div>;
  return (
    <div className={`ai-msg bot${x.streaming ? " streaming" : ""}`}>
      <div className="ai-avatar"><Sparkles size={14} /></div>
      <div className="ai-body">
        {x.content ? <div className="ai-md" dangerouslySetInnerHTML={{ __html: html }} /> : x.streaming ? <div className="ai-typing"><span /><span /><span /></div> : null}
        {x.error && <p className="ai-error" role="alert">{x.error}</p>}
        {!x.streaming && (x.content || x.error) && (
          <div className="ai-tools">
            {x.content && (
              <button onClick={() => void navigator.clipboard.writeText(x.content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })} title={t("ai.copy")} aria-label={t("ai.copy")}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            )}
            {canRegenerate && <button onClick={onRegenerate} title={t("ai.regenerate")} aria-label={t("ai.regenerate")}><RotateCcw size={13} /></button>}
            {tutor && x.messageId && !x.reported && !reporting && (
              <button onClick={() => setReporting(true)} title={t("tutor.report")} aria-label={t("tutor.report")}><Flag size={13} /></button>
            )}
            {x.reported && <span className="muted">{t("tutor.reported")}</span>}
            {x.provider && <span className="muted">{t("ai.by", { p: providerName(x.provider) })}</span>}
          </div>
        )}
        {reporting && !x.reported && (
          <div className="ai-report" role="group" aria-label={t("tutor.report")}>
            <span className="muted small">{t("tutor.reportWhy")}</span>
            {(["wrong", "answer", "inappropriate"] as const).map((r) => (
              <button key={r} className="btn sm" onClick={() => { onReport(r); setReporting(false); }}>{t(`tutor.why.${r}` as Key)}</button>
            ))}
            <button className="link-btn small" onClick={() => setReporting(false)}>{t("tutor.cancel")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="empty ai-empty">
      <div className="ai-orb">{icon}</div>
      <p><strong>{title}</strong></p>
      <p className="muted small">{body}</p>
      {children}
    </div>
  );
}
