import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "../../http/request";
import styles from "./index.module.less";

type DnsStatus = "verified" | "pending" | "missing" | "mismatch";

type DnsRecord = {
  type: string;
  host: string;
  value: string;
  ttl: string;
  priority?: number;
};

type DnsCheck = {
  key: string;
  label: string;
  expected: string;
  actual: string;
  status: DnsStatus;
};

type DomainSettings = {
  primaryDomain: string | null;
  mailHost: string | null;
  publicHost: string;
};

type RecordsResponse = DomainSettings & {
  records: DnsRecord[];
};

type CheckResponse = {
  checks: DnsCheck[];
};

const steps = [
  { label: "域名", description: "保存主域名" },
  { label: "DNS", description: "添加邮件记录" },
  { label: "验证", description: "检查解析状态" },
  { label: "完成", description: "启用邮箱系统" },
];

const statusText: Record<DnsStatus, string> = {
  verified: "已通过",
  pending: "等待检测",
  missing: "未查询到",
  mismatch: "不匹配",
};

const statusClass: Record<DnsStatus, string> = {
  verified: styles.verified,
  pending: styles.pending,
  missing: styles.missing,
  mismatch: styles.missing,
};

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function getDomainState(domain: string) {
  if (!domain.trim()) {
    return {
      label: "待输入",
      message: "输入用于收发邮件的主域名，例如 example.com。",
      className: styles.idle,
      isValid: false,
    };
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain.trim())) {
    return {
      label: "格式需检查",
      message: "域名应只填写主域名，不要带 http://、路径或邮箱地址。",
      className: styles.warning,
      isValid: false,
    };
  }

  return {
    label: "可保存",
    message: "域名格式有效，保存后会生成 MX、A、SPF、DKIM、DMARC 记录。",
    className: styles.ready,
    isValid: true,
  };
}

function recordCheckKey(record: DnsRecord) {
  if (record.type === "MX") {
    return "mx";
  }
  if (record.type === "A") {
    return "a";
  }
  if (record.type === "TXT" && record.host.includes("_domainkey")) {
    return "dkim";
  }
  if (record.type === "TXT" && record.host === "_dmarc") {
    return "dmarc";
  }
  if (record.type === "TXT" && record.host === "@") {
    return "spf";
  }
  return "";
}

function isInboundReady(checks: DnsCheck[]) {
  const mx = checks.find((check) => check.key === "mx")?.status;
  const a = checks.find((check) => check.key === "a")?.status;
  return mx === "verified" && a === "verified";
}

export default function Setup() {
  const navigate = useNavigate();
  const [domain, setDomain] = useState("");
  const [publicHost, setPublicHost] = useState("");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [checks, setChecks] = useState<DnsCheck[]>([]);
  const [copiedKey, setCopiedKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [message, setMessage] = useState("");

  const domainState = useMemo(() => getDomainState(domain), [domain]);
  const checkByKey = useMemo(() => new Map(checks.map((check) => [check.key, check])), [checks]);
  const verifiedCount = checks.filter((check) => check.status === "verified").length;
  const progressBase = records.length > 0 ? Math.round((verifiedCount / records.length) * 100) : domain ? 25 : 0;
  const isComplete = isInboundReady(checks);
  const progress = isComplete ? Math.max(progressBase, 75) : progressBase;
  const activeStep = isComplete ? 3 : checks.length > 0 ? 2 : records.length > 0 ? 1 : domain.trim() ? 0 : 0;

  const loadRecords = async () => {
    const response = await request.get<unknown, RecordsResponse>("/api/dns/records");
    setRecords(response.records);
    setDomain(response.primaryDomain ?? "");
    setPublicHost(response.publicHost);
  };

  const loadChecks = async () => {
    const response = await request.get<unknown, CheckResponse>("/api/dns/check");
    setChecks(response.checks);
  };

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      try {
        const settings = await request.get<unknown, DomainSettings>("/api/domain/settings");
        if (ignore) {
          return;
        }
        setDomain(settings.primaryDomain ?? "");
        setPublicHost(settings.publicHost);

        if (settings.primaryDomain) {
          await loadRecords();
          await loadChecks();
        }
      } catch (error) {
        if (!ignore) {
          setMessage((error as Error).message || "读取配置失败。");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  const handleSave = async () => {
    const nextDomain = normalizeDomain(domain);
    const nextPublicHost = publicHost.trim();

    if (!getDomainState(nextDomain).isValid) {
      setMessage("请先填写有效主域名。");
      return;
    }
    if (!/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(nextPublicHost)) {
      setMessage("请填写有效服务器公网 IPv4 地址。");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      await request.put("/api/domain/settings", {
        primaryDomain: nextDomain,
        publicHost: nextPublicHost,
      });
      await loadRecords();
      await loadChecks();
      setMessage("域名配置已保存，DNS 记录已生成。");
    } catch (error) {
      setMessage((error as Error).message || "保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setMessage("");
    try {
      await loadChecks();
      setMessage("DNS 检测完成。");
    } catch (error) {
      setMessage((error as Error).message || "检测失败。");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRotateDkim = async () => {
    const confirmed = window.confirm("重新生成 DKIM 后，旧 DKIM TXT 记录会失效，需要到 DNS 服务商重新粘贴新的 DKIM 记录。继续吗？");
    if (!confirmed) {
      return;
    }

    setIsRotating(true);
    setMessage("");
    try {
      await request.post("/api/dns/dkim/rotate");
      await loadRecords();
      await loadChecks();
      setMessage("DKIM 已重新生成，请更新 DNS 中的 DKIM TXT 记录。");
    } catch (error) {
      setMessage((error as Error).message || "DKIM 生成失败。");
    } finally {
      setIsRotating(false);
    }
  };

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permission may be unavailable in some embedded browsers.
    }

    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1600);
  };

  const derivedMailHost = getDomainState(domain).isValid ? `mail.${normalizeDomain(domain)}` : "mail.example.com";
  const renderCopyCell = (text: string, key: string, variant: "mono" | "value" = "mono") => (
    <div className={`${styles.copyCell} ${variant === "value" ? styles.valueCopyCell : ""}`}>
      {variant === "value" ? (
        <code title={text}>{text}</code>
      ) : (
        <span className={styles.copyCellText} title={text}>
          {text}
        </span>
      )}
      <button className={styles.inlineCopyButton} type="button" onClick={() => handleCopyText(text, key)} aria-label={`复制 ${text}`}>
        <span aria-hidden="true">⧉</span>
        <span className={styles.copyHint}>{copiedKey === key ? "已复制" : "复制"}</span>
      </button>
    </div>
  );

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="setup-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>配置引导</p>
            <h1 id="setup-title">自建邮箱域名设置</h1>
          </div>
          <div className={`${styles.systemStatus} ${isComplete ? styles.done : ""}`}>
            <span className={styles.statusDot} />
            {isComplete ? "收件基础记录已通过" : "等待 DNS 验证"}
          </div>
        </header>

        <div className={styles.progressBlock}>
          <div className={styles.progressMeta}>
            <span>配置进度</span>
            <strong>{progress}%</strong>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li className={`${styles.step} ${index <= activeStep ? styles.activeStep : ""}`} key={step.label}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.workspace}>
          <section className={styles.domainPane} aria-label="域名设置">
            <div className={styles.sectionTitle}>
              <div>
                <p className={styles.kicker}>Domain</p>
                <h2>主域名</h2>
              </div>
              <span className={`${styles.domainBadge} ${domainState.className}`}>{domainState.label}</span>
            </div>

            <label className={styles.domainField}>
              <span>主域名</span>
              <input
                value={domain}
                onChange={(event) => {
                  const nextDomain = event.target.value;
                  setDomain(nextDomain);
                  setRecords([]);
                  setChecks([]);
                }}
                placeholder="example.com"
                spellCheck={false}
              />
            </label>
            <label className={styles.domainField}>
              <span>服务器公网 IP</span>
              <input
                value={publicHost}
                onChange={(event) => {
                  setPublicHost(event.target.value);
                  setRecords([]);
                  setChecks([]);
                }}
                placeholder="203.0.113.10"
                spellCheck={false}
              />
            </label>
            <div className={styles.derivedHost}>
              <span>邮件主机名</span>
              <strong>{derivedMailHost}</strong>
            </div>
            <p className={styles.helper}>
              {domainState.message}
              {publicHost ? ` DNS 会生成到 ${publicHost}。` : " 服务器公网 IP 用于生成 A 记录和 SPF。"}
            </p>

            <div className={styles.buttonRow}>
              <button className={styles.verifyButton} type="button" onClick={handleSave} disabled={isSaving || isLoading}>
                <span aria-hidden="true">{isSaving ? "..." : "✓"}</span>
                {isSaving ? "保存中" : "保存并生成"}
              </button>
              <button className={styles.verifyButton} type="button" onClick={handleRotateDkim} disabled={isRotating || !records.length}>
                <span aria-hidden="true">{isRotating ? "..." : "↻"}</span>
                {isRotating ? "生成中" : "重生成 DKIM"}
              </button>
            </div>

            {message ? <p className={styles.message}>{message}</p> : null}

            <div className={styles.checkList}>
              {["mx", "a", "spf", "dkim", "dmarc"].map((key) => {
                const check = checkByKey.get(key);
                const ok = check?.status === "verified";
                return (
                  <div key={key}>
                    <span className={ok ? styles.checkIcon : styles.waitIcon}>{ok ? "✓" : "•"}</span>
                    <p>{check ? `${check.label}：${statusText[check.status]}` : `${key.toUpperCase()}：待检测`}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.recordsPane} aria-label="DNS 记录">
            <div className={styles.sectionTitle}>
              <div>
                <p className={styles.kicker}>DNS Records</p>
                <h2>需要添加的记录</h2>
              </div>
              <button className={styles.verifyButton} type="button" onClick={handleVerify} disabled={isVerifying || !records.length}>
                <span aria-hidden="true">{isVerifying ? "..." : "↻"}</span>
                {isVerifying ? "验证中" : "重新验证"}
              </button>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.recordsTable}>
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>主机记录</th>
                    <th>记录值</th>
                    <th>TTL</th>
                    <th>优先级</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length ? (
                    records.map((record) => {
                      const key = `${record.type}-${record.host}`;
                      const check = checkByKey.get(recordCheckKey(record));
                      const rowStatus = check?.status ?? "pending";

                      return (
                        <tr key={key}>
                          <td>
                            <span className={styles.recordType}>{record.type}</span>
                          </td>
                          <td className={styles.mono}>{renderCopyCell(record.host, `${key}-host`)}</td>
                          <td className={styles.valueCell}>
                            {renderCopyCell(record.value, `${key}-value`, "value")}
                            {check ? (
                              <small className={styles.checkDetail} title={check.actual}>
                                实际：{check.actual}
                              </small>
                            ) : null}
                          </td>
                          <td className={styles.mono}>{renderCopyCell(record.ttl, `${key}-ttl`)}</td>
                          <td className={styles.mono}>
                            {record.priority === undefined ? "-" : renderCopyCell(String(record.priority), `${key}-priority`)}
                          </td>
                          <td>
                            <span className={`${styles.recordStatus} ${statusClass[rowStatus]}`}>{statusText[rowStatus]}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className={styles.emptyCell}>
                        保存主域名后生成 DNS 记录。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className={`${styles.finishBar} ${isComplete ? styles.finishReady : ""}`}>
          <div>
            <strong>{isComplete ? "收件基础配置已通过" : "可以先进入邮箱，DNS 可稍后继续完善"}</strong>
            <span>
              {isComplete
                ? `${domain || "当前域名"} 的 MX 与 A 记录已通过检测。`
                : "发信可信度还依赖 SPF、DKIM、DMARC；直连外发还需要服务器 25 端口与 rDNS。"}
            </span>
          </div>
          <button className={styles.finishButton} type="button" onClick={() => navigate("/mailboxes")}>
            进入邮箱
          </button>
        </footer>
      </section>
    </main>
  );
}
