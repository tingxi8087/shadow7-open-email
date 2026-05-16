import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { request } from "@/http/request";
import styles from "./index.module.less";

type Folder = "inbox" | "sent" | "trash";
type Filter = "all" | "unread" | "starred" | "attachments";

type Message = {
  id: number;
  fromEmail: string;
  fromName: string | null;
  toEmails: string;
  ccEmails: string;
  bccEmails: string;
  toContacts: string;
  ccContacts: string;
  bccContacts: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  folder: Folder;
  direction: "incoming" | "outgoing";
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
};

type MailContact = {
  name: string;
  email: string;
};

type ListResponse = {
  items: Message[];
  counts: Record<Folder, number> & { unread: number };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type DetailResponse = {
  message: Message & {
    attachments: Array<{
      id: number;
      filename: string;
      mimeType: string;
      size: number;
    }>;
  };
};

type SystemStatus = {
  gateway: "online" | "offline";
  dns: "ok" | "pending" | "not_configured";
  dnsVerified: number;
  dnsTotal: number;
  mailHost: string | null;
  primaryDomain: string | null;
  publicHost: string | null;
  smtpInboundEnabled: boolean;
  outboundMode: "direct" | "smtp";
  outboundStatus: "configured" | "incomplete";
  senderDisplayName: string;
  unreadCount: number;
};

const filters: Array<{ label: string; value: Filter }> = [
  { label: "全部邮件", value: "all" },
  { label: "未读", value: "unread" },
  { label: "已加星标", value: "starred" },
  { label: "带附件", value: "attachments" },
];

const folderLabels: Record<Folder, string> = {
  inbox: "收件箱",
  sent: "发件箱",
  trash: "回收站",
};

function formatTime(message: Message) {
  const value = message.receivedAt || message.sentAt || message.createdAt;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseContacts(value: string, fallbackEmails: string): MailContact[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const contacts = parsed
        .map((item) => ({
          name: typeof item?.name === "string" ? item.name : "",
          email: typeof item?.email === "string" ? item.email : "",
        }))
        .filter((item) => item.email);
      if (contacts.length) {
        return contacts;
      }
    }
  } catch {
    // Fall back to legacy email-only fields below.
  }

  try {
    const emails = JSON.parse(fallbackEmails);
    if (Array.isArray(emails)) {
      return emails.filter(Boolean).map((email) => ({ name: "", email: String(email) }));
    }
  } catch {
    return fallbackEmails ? [{ name: "", email: fallbackEmails }] : [];
  }

  return [];
}

function formatContact(contact: MailContact) {
  return contact.name ? `${contact.name} <${contact.email}>` : contact.email;
}

function formatContacts(contacts: MailContact[]) {
  return contacts.map(formatContact).join(", ");
}

function fromContact(mail: Message): MailContact {
  return {
    name: mail.fromName || "",
    email: mail.fromEmail,
  };
}

function toContacts(mail: Message) {
  return parseContacts(mail.toContacts, mail.toEmails);
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }
  return `${size} B`;
}

function apiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
  return `${baseUrl}${path}`;
}

export default function Mailboxes() {
  const navigate = useNavigate();
  const lastRefreshAt = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFolder = searchParams.get("folder");
  const initialPage = Number(searchParams.get("page") || 1);
  const [folder, setFolderState] = useState<Folder>(
    initialFolder === "sent" || initialFolder === "trash" ? initialFolder : "inbox",
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPageState] = useState(Number.isInteger(initialPage) && initialPage > 0 ? initialPage : 1);
  const pageSize = 10;
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedMail, setSelectedMail] = useState<DetailResponse["message"] | null>(null);
  const [counts, setCounts] = useState<ListResponse["counts"]>({
    inbox: 0,
    sent: 0,
    trash: 0,
    unread: 0,
  });
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    gateway: "online",
    dns: "not_configured",
    dnsVerified: 0,
    dnsTotal: 5,
    mailHost: null,
    primaryDomain: null,
    publicHost: null,
    smtpInboundEnabled: true,
    outboundMode: "direct",
    outboundStatus: "configured",
    senderDisplayName: "",
    unreadCount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [pagination, setPagination] = useState<ListResponse["pagination"]>({
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  });

  const folders = useMemo(
    () =>
      (["inbox", "sent", "trash"] as Folder[]).map((item) => ({
        label: folderLabels[item],
        value: item,
        count: counts[item],
      })),
    [counts],
  );

  const setFolder = (nextFolder: Folder) => {
    setFolderState(nextFolder);
    setPageState(1);
    setSearchParams({ folder: nextFolder, page: "1" });
  };

  const setPage = (nextPage: number) => {
    const safePage = Math.max(1, Math.min(pagination.totalPages, nextPage));
    setPageState(safePage);
    setSearchParams({ folder, page: String(safePage) });
  };

  const loadMessages = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const response = await request.get<ListResponse, ListResponse>("/api/messages", {
        params: {
          folder,
          filter,
          q: query || undefined,
          page,
          pageSize,
        },
      });
      setMessages(response.items);
      setCounts(response.counts);
      setPagination(response.pagination);
      setSelectedId((current) => {
        if (current && response.items.some((item) => item.id === current)) {
          return current;
        }
        return response.items[0]?.id ?? null;
      });
    } catch {
      setMessage("邮件列表加载失败。");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSystemStatus = async () => {
    const status = await request.get<SystemStatus, SystemStatus>("/api/system/status");
    setSystemStatus(status);
  };

  const refreshAll = async () => {
    const now = Date.now();
    if (isRefreshing || now - lastRefreshAt.current < 1000) {
      return;
    }

    lastRefreshAt.current = now;
    setIsRefreshing(true);
    try {
      await Promise.all([loadMessages(), loadSystemStatus()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [folder, filter, page]);

  useEffect(() => {
    setPageState(1);
    const timer = window.setTimeout(() => {
      loadMessages();
    }, 260);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    loadSystemStatus().catch(() => undefined);
  }, [messages.length]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedMail(null);
      return;
    }

    request
      .get<DetailResponse, DetailResponse>(`/api/messages/${selectedId}`)
      .then((response) => {
        setSelectedMail(response.message);
      })
      .catch(() => {
        setSelectedMail(null);
      });
  }, [selectedId]);

  const patchMessage = async (id: number, patch: Partial<Pick<Message, "isRead" | "isStarred" | "folder">>) => {
    const response = await request.patch<{ message: Message }, { message: Message }>(`/api/messages/${id}`, patch);
    setMessages((current) => current.map((item) => (item.id === id ? { ...item, ...response.message } : item)));
    setSelectedMail((current) => (current?.id === id ? { ...current, ...response.message } : current));
    await loadMessages();
  };

  const handleLogout = async () => {
    await request.post("/api/auth/logout");
    navigate("/login", { replace: true });
  };

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="邮件文件夹">
        <div className={styles.brand}>
          <span className={styles.brandMark}>S7</span>
          <span>Mail</span>
        </div>

        <Link className={styles.composeButton} to="/compose">
          写邮件
        </Link>
        <Link className={styles.settingsLink} to="/settings">
          系统设置
        </Link>

        <nav className={styles.navList}>
          {folders.map((item) => (
            <button
              className={`${styles.navItem} ${item.value === folder ? styles.navActive : ""}`}
              key={item.value}
              onClick={() => {
                setFolder(item.value);
                setFilter("all");
              }}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.liveDot} />
          <span title={systemStatus.mailHost ? `${systemStatus.mailHost} 在线` : "邮件服务在线"}>
            {systemStatus.mailHost ? `${systemStatus.mailHost} 在线` : "邮件服务在线"}
          </span>
        </div>
        <button className={styles.logoutButton} onClick={handleLogout} type="button">
          退出
        </button>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.toolbar}>
          <div>
            <p className={styles.eyebrow}>邮件首页</p>
            <h1>{folderLabels[folder]}</h1>
          </div>
          <div className={styles.actions}>
            <div className={styles.statusStrip} aria-label="系统状态">
              <span className={systemStatus.gateway === "online" ? styles.statusOk : styles.statusWarn}>
                {systemStatus.gateway === "online" ? "入站在线" : "入站关闭"}
              </span>
              <span className={systemStatus.dns === "ok" ? styles.statusOk : styles.statusWarn}>
                {systemStatus.dns === "ok"
                  ? "DNS 正常"
                  : systemStatus.dns === "not_configured"
                    ? "DNS 未配置"
                    : `DNS ${systemStatus.dnsVerified}/${systemStatus.dnsTotal}`}
              </span>
              <span className={systemStatus.outboundStatus === "configured" ? styles.statusOk : styles.statusWarn}>
                {systemStatus.outboundMode === "smtp" ? "Relay 外发" : "直连外发"}
              </span>
              <span>未读 {systemStatus.unreadCount}</span>
            </div>
            <label className={styles.search}>
              <span>搜索</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="发件人、主题、正文"
                value={query}
              />
            </label>
            <select
              className={styles.select}
              onChange={(event) => {
                setFolder(event.target.value as Folder);
                setFilter("all");
              }}
              value={folder}
            >
              <option value="inbox">收件箱</option>
              <option value="sent">发件箱</option>
              <option value="trash">回收站</option>
            </select>
          </div>
        </header>

        <div className={styles.filterBar} aria-label="邮件筛选">
          {filters.map((item) => (
            <button
              className={`${styles.filterPill} ${item.value === filter ? styles.filterActive : ""}`}
              key={item.value}
              onClick={() => {
                setFilter(item.value);
                setPageState(1);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <button className={styles.refreshButton} disabled={isLoading || isRefreshing} onClick={refreshAll} type="button">
            <span aria-hidden="true">{isLoading || isRefreshing ? "..." : "↻"}</span>
            {isLoading || isRefreshing ? "刷新中" : "刷新"}
          </button>
        </div>

        {message && <p className={styles.inlineMessage}>{message}</p>}

        <div className={styles.mailShell}>
          <section className={styles.mailList} aria-label="邮件列表">
            {!isLoading && !messages.length && <div className={styles.empty}>没有符合条件的邮件</div>}
            {messages.map((mail) => {
              const sender = formatContact(fromContact(mail));
              const recipients = formatContacts(toContacts(mail));

              return (
                <article
                  className={`${styles.mailRow} ${mail.id === selectedId ? styles.mailSelected : ""}`}
                  key={mail.id}
                  onClick={() => {
                    setSelectedId(mail.id);
                    if (!mail.isRead) {
                      patchMessage(mail.id, { isRead: true });
                    }
                  }}
                >
                  <div className={styles.mailMeta}>
                    <span className={!mail.isRead ? styles.unreadDot : styles.readDot} />
                    <strong>{sender}</strong>
                    <time>{formatTime(mail)}</time>
                  </div>
                  <div className={styles.mailSubject}>
                    <span>{mail.subject}</span>
                    {mail.isStarred && <i aria-label="已加星标">★</i>}
                    {mail.hasAttachments && <em aria-label="带附件">⌘</em>}
                  </div>
                  <p>{mail.textBody}</p>
                  <div className={styles.mailTags}>
                    <span>{folderLabels[mail.folder]}</span>
                    <small>发件人 {sender}</small>
                    {recipients && <small>收件人 {recipients}</small>}
                  </div>
                </article>
              );
            })}
          </section>

          <aside className={styles.preview} aria-label="邮件预览">
            {selectedMail ? (
              <>
                <div className={styles.previewTop}>
                  <span className={styles.folderBadge}>{folderLabels[selectedMail.folder]}</span>
                  <div className={styles.previewActions}>
                    {selectedMail.folder !== "trash" && (
                      <button
                        onClick={() =>
                          patchMessage(selectedMail.id, {
                            isStarred: !selectedMail.isStarred,
                          })
                        }
                        type="button"
                      >
                        {selectedMail.isStarred ? "取消星标" : "星标"}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        patchMessage(selectedMail.id, {
                          folder: selectedMail.folder === "trash" ? "inbox" : "trash",
                        })
                      }
                      type="button"
                    >
                      {selectedMail.folder === "trash" ? "恢复" : "删除"}
                    </button>
                  </div>
                </div>
                <h2>{selectedMail.subject}</h2>
                <div className={styles.senderLine}>
                  <span>{formatContact(fromContact(selectedMail)).slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>发件人 {formatContact(fromContact(selectedMail))}</strong>
                    <small>收件人 {formatContacts(toContacts(selectedMail)) || "-"}</small>
                    {formatContacts(parseContacts(selectedMail.ccContacts, selectedMail.ccEmails)) && (
                      <small>抄送 {formatContacts(parseContacts(selectedMail.ccContacts, selectedMail.ccEmails))}</small>
                    )}
                    {formatContacts(parseContacts(selectedMail.bccContacts, selectedMail.bccEmails)) && (
                      <small>密送 {formatContacts(parseContacts(selectedMail.bccContacts, selectedMail.bccEmails))}</small>
                    )}
                  </div>
                  <time>{formatTime(selectedMail)}</time>
                </div>
                {selectedMail.attachments.length ? (
                  <div className={styles.attachments}>
                    <strong>附件</strong>
                    <div>
                      {selectedMail.attachments.map((attachment) => (
                        <a
                          href={apiUrl(`/api/messages/${selectedMail.id}/attachments/${attachment.id}/download`)}
                          key={attachment.id}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span>{attachment.filename}</span>
                          <small>{formatSize(attachment.size)}</small>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedMail.htmlBody ? (
                  <div
                    className={styles.previewBody}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedMail.htmlBody) }}
                  />
                ) : (
                  <div className={styles.previewBody}>
                    {(selectedMail.textBody || "").split("\n").map((line, index) => (
                      <p key={`${line}-${index}`}>{line || "\u00a0"}</p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.empty}>选择一封邮件查看内容</div>
            )}
          </aside>
        </div>
        <div className={styles.pagination}>
          <button disabled={pagination.page <= 1} onClick={() => setPage(page - 1)} type="button">
            上一页
          </button>
          <span>
            {pagination.page} / {pagination.totalPages} · 共 {pagination.total}
          </span>
          <button disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(page + 1)} type="button">
            下一页
          </button>
        </div>
      </section>
    </main>
  );
}
