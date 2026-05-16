import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "@/http/request";
import styles from "./index.module.less";

const draftStorageKey = "shadow7.compose.draft";

type ComposeDraft = {
  fromLocalPart: string;
  fromName: string;
  to: string;
  cc: string;
  subject: string;
  textBody: string;
  updatedAt: string;
};

function splitEmails(value: string) {
  return value
    .split(/[,\s;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function hasDraftContent(draft: Omit<ComposeDraft, "updatedAt">) {
  return Boolean(
    (draft.fromLocalPart.trim() && draft.fromLocalPart.trim() !== "admin") ||
      draft.fromName.trim() ||
      draft.to.trim() ||
      draft.cc.trim() ||
      draft.subject.trim() ||
      draft.textBody.trim(),
  );
}

function readDraft() {
  try {
    const value = window.localStorage.getItem(draftStorageKey);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as ComposeDraft;
  } catch {
    return null;
  }
}

function formatDraftTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function Compose() {
  const navigate = useNavigate();
  const didRestoreDraft = useRef(false);
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [fromLocalPart, setFromLocalPart] = useState("admin");
  const [fromName, setFromName] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [textBody, setTextBody] = useState("");
  const [message, setMessage] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftState, setDraftState] = useState<"idle" | "dirty" | "saved" | "restored">("idle");
  const [isSending, setIsSending] = useState(false);
  const draft = useMemo(
    () => ({
      fromLocalPart,
      fromName,
      to,
      cc,
      subject,
      textBody,
    }),
    [cc, fromLocalPart, fromName, subject, textBody, to],
  );

  const persistDraft = (nextDraft = draft) => {
    const updatedAt = new Date().toISOString();

    if (!hasDraftContent(nextDraft)) {
      window.localStorage.removeItem(draftStorageKey);
      setDraftSavedAt("");
      setDraftState("idle");
      return;
    }

    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        ...nextDraft,
        updatedAt,
      }),
    );
    setDraftSavedAt(updatedAt);
    setDraftState("saved");
  };

  const clearDraft = () => {
    window.localStorage.removeItem(draftStorageKey);
    setFromLocalPart("admin");
    setFromName("");
    setTo("");
    setCc("");
    setSubject("");
    setTextBody("");
    setDraftSavedAt("");
    setDraftState("idle");
    setMessage("草稿已清空。");
  };

  useEffect(() => {
    request
      .get<{ primaryDomain: string | null }, { primaryDomain: string | null }>("/api/system/status")
      .then((status) => {
        setPrimaryDomain(status.primaryDomain || "");
        const displayName = (status as { senderDisplayName?: string }).senderDisplayName;
        if (displayName) {
          setFromName((current) => current || displayName);
        }
      })
      .catch(() => {
        setPrimaryDomain("");
      });
  }, []);

  useEffect(() => {
    const savedDraft = readDraft();
    if (!savedDraft) {
      didRestoreDraft.current = true;
      return;
    }

    setFromLocalPart(savedDraft.fromLocalPart || "admin");
    setFromName(savedDraft.fromName || "");
    setTo(savedDraft.to || "");
    setCc(savedDraft.cc || "");
    setSubject(savedDraft.subject || "");
    setTextBody(savedDraft.textBody || "");
    setDraftSavedAt(savedDraft.updatedAt);
    setDraftState("restored");
    didRestoreDraft.current = true;
  }, []);

  useEffect(() => {
    if (!didRestoreDraft.current) {
      return;
    }

    setDraftState((current) => (current === "restored" ? current : "dirty"));
    const timer = window.setTimeout(() => persistDraft(), 500);

    return () => window.clearTimeout(timer);
  }, [draft]);

  const handleSend = async () => {
    setMessage("");
    setIsSending(true);

    try {
      await request.post("/api/messages/send", {
        fromLocalPart,
        fromName,
        to: splitEmails(to),
        cc: splitEmails(cc),
        subject,
        textBody,
      });
      await request.put("/api/system/preferences", {
        senderDisplayName: fromName.trim(),
      });
      window.localStorage.removeItem(draftStorageKey);
      navigate("/mailboxes?folder=sent&page=1", { replace: true });
    } catch (error) {
      if (typeof error === "object" && error && "response" in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response;
        setMessage(response?.data?.message || "发送失败。");
      } else {
        setMessage("发送失败。");
      }
    } finally {
      setIsSending(false);
    }
  };

  const draftLabel =
    draftState === "restored"
      ? `已恢复草稿${draftSavedAt ? ` ${formatDraftTime(draftSavedAt)}` : ""}`
      : draftState === "dirty"
        ? "草稿保存中"
        : draftState === "saved" && draftSavedAt
          ? `草稿已保存 ${formatDraftTime(draftSavedAt)}`
          : "未保存草稿";

  return (
    <main className={styles.page}>
      <section className={styles.composer} aria-labelledby="compose-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>写邮件</p>
            <h1 id="compose-title">新邮件</h1>
          </div>
          <Link className={styles.backLink} to="/mailboxes">
            返回列表
          </Link>
        </header>

        <div className={styles.fields}>
          <label>
            <span>发件人</span>
            <div className={styles.senderField}>
              <input
                onChange={(event) => setFromLocalPart(event.target.value)}
                placeholder="admin"
                spellCheck={false}
                value={fromLocalPart}
              />
              <strong>@{primaryDomain || "未配置域名"}</strong>
            </div>
          </label>
          <label>
            <span>昵称</span>
            <input onChange={(event) => setFromName(event.target.value)} placeholder="可选，例如 Shadow7 Mail" value={fromName} />
          </label>
          <label>
            <span>收件人</span>
            <input onChange={(event) => setTo(event.target.value)} placeholder="name@example.com" value={to} />
          </label>
          <label>
            <span>抄送</span>
            <input onChange={(event) => setCc(event.target.value)} placeholder="可选" value={cc} />
          </label>
          <label>
            <span>主题</span>
            <input onChange={(event) => setSubject(event.target.value)} placeholder="邮件主题" value={subject} />
          </label>
        </div>

        <div className={styles.editor}>
          <div className={styles.formatBar} aria-label="格式工具">
            <button type="button">B</button>
            <button type="button">I</button>
            <button type="button">•</button>
            <button type="button">附</button>
          </div>
          <textarea onChange={(event) => setTextBody(event.target.value)} placeholder="写点什么..." value={textBody} />
        </div>

        <footer className={styles.footer}>
          <span>{message || draftLabel}</span>
          <div>
            <button className={styles.secondaryButton} onClick={() => persistDraft()} type="button">
              存草稿
            </button>
            <button className={styles.secondaryButton} onClick={clearDraft} type="button">
              清空
            </button>
            <button className={styles.sendButton} disabled={isSending} onClick={handleSend} type="button">
              {isSending ? "发送中" : "发送"}
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
