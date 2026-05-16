import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "@/http/request";
import styles from "./index.module.less";

type OutboundMode = "direct" | "smtp";

type SettingsResponse = {
  mode: OutboundMode;
  relay: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    hasPassword: boolean;
  };
};

export default function OutboundSettings() {
  const [mode, setMode] = useState<OutboundMode>("direct");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(465);
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    request
      .get<SettingsResponse, SettingsResponse>("/api/outbound/settings")
      .then((settings) => {
        setMode(settings.mode);
        setHost(settings.relay.host);
        setPort(settings.relay.port);
        setSecure(settings.relay.secure);
        setUser(settings.relay.user);
        setHasPassword(settings.relay.hasPassword);
      })
      .catch(() => setMessage("外发设置加载失败。"));
  }, []);

  const payload = () => ({
    mode,
    relay: {
      host,
      port,
      secure,
      user,
      pass,
    },
  });

  const save = async () => {
    setMessage("");
    setIsSaving(true);
    try {
      const settings = await request.put<SettingsResponse, SettingsResponse>("/api/outbound/settings", payload());
      setHasPassword(settings.relay.hasPassword);
      setPass("");
      setMessage("外发设置已保存。");
    } catch (error) {
      const response = (error as { response?: { data?: { message?: string } } }).response;
      setMessage(response?.data?.message || "外发设置保存失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const test = async () => {
    setMessage("");
    setIsTesting(true);
    try {
      await request.post("/api/outbound/test", {
        ...payload(),
        to: testTo,
      });
      setHasPassword(true);
      setPass("");
      setMessage("测试邮件已提交。");
    } catch (error) {
      const response = (error as { response?: { data?: { message?: string } } }).response;
      setMessage(response?.data?.message || "测试发送失败。");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="outbound-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>系统设置</p>
            <h1 id="outbound-title">外发方式</h1>
          </div>
          <Link className={styles.backLink} to="/mailboxes">
            返回邮箱
          </Link>
        </header>

        <div className={styles.modeSwitch} aria-label="发件方式">
          <button className={mode === "direct" ? styles.active : ""} onClick={() => setMode("direct")} type="button">
            直连 MX
          </button>
          <button className={mode === "smtp" ? styles.active : ""} onClick={() => setMode("smtp")} type="button">
            SMTP Relay
          </button>
        </div>

        <section className={styles.section}>
          <h2>{mode === "direct" ? "直连 MX" : "SMTP Relay"}</h2>
          <p>
            {mode === "direct"
              ? "服务器直接连接收件方 MX 的 25 端口，适合允许出站 25 的部署环境。"
              : "通过标准 SMTP 服务商提交邮件，适合腾讯云、阿里云、AWS 等限制出站 25 的环境。"}
          </p>
        </section>

        {mode === "smtp" && (
          <section className={styles.formGrid} aria-label="SMTP Relay 配置">
            <label>
              <span>Host</span>
              <input onChange={(event) => setHost(event.target.value)} placeholder="smtp.resend.com" value={host} />
            </label>
            <label>
              <span>Port</span>
              <input
                onChange={(event) => setPort(Number(event.target.value))}
                placeholder="465"
                type="number"
                value={port}
              />
            </label>
            <label>
              <span>Username</span>
              <input onChange={(event) => setUser(event.target.value)} placeholder="resend" value={user} />
            </label>
            <label>
              <span>Password / API Key</span>
              <input
                onChange={(event) => setPass(event.target.value)}
                placeholder={hasPassword ? "已配置，留空则不修改" : "输入 SMTP 密码或 API Key"}
                type="password"
                value={pass}
              />
            </label>
            <label className={styles.checkLine}>
              <input checked={secure} onChange={(event) => setSecure(event.target.checked)} type="checkbox" />
              <span>使用 SSL/TLS</span>
            </label>
          </section>
        )}

        <section className={styles.testBox}>
          <label>
            <span>测试收件人</span>
            <input onChange={(event) => setTestTo(event.target.value)} placeholder="user@example.com" value={testTo} />
          </label>
          <button disabled={isTesting} onClick={test} type="button">
            {isTesting ? "测试中" : "发送测试邮件"}
          </button>
        </section>

        {message && <p className={styles.message}>{message}</p>}

        <footer className={styles.footer}>
          <button disabled={isSaving} onClick={save} type="button">
            {isSaving ? "保存中" : "保存设置"}
          </button>
        </footer>
      </section>
    </main>
  );
}
