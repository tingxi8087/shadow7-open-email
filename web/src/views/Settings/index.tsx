import { Link } from "react-router-dom";
import styles from "./index.module.less";

const sections = [
  {
    title: "账号安全",
    description: "修改管理员密码，后续会加入 session 管理。",
    to: "/settings/security",
  },
  {
    title: "外发方式",
    description: "切换直连 MX 或 SMTP Relay，并发送测试邮件。",
    to: "/settings/outbound",
  },
  {
    title: "域名与 DNS",
    description: "配置主域名、生成 DNS 记录和检查解析状态。",
    to: "/setup",
  },
];

export default function Settings() {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="settings-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>系统设置</p>
            <h1 id="settings-title">配置中心</h1>
          </div>
          <Link className={styles.backLink} to="/mailboxes">
            返回邮箱
          </Link>
        </header>

        <div className={styles.grid}>
          {sections.map((section) => (
            <Link className={styles.card} key={section.to} to={section.to}>
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
