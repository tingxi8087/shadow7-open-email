import { useState } from "react";
import { Link } from "react-router-dom";
import { request } from "@/http/request";
import styles from "./index.module.less";

export default function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    setMessage("");
    setIsSaving(true);
    try {
      await request.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("管理员密码已修改。");
    } catch (error) {
      const response = (error as { response?: { data?: { message?: string } } }).response;
      setMessage(response?.data?.message || "密码修改失败。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="security-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>账号安全</p>
            <h1 id="security-title">修改管理员密码</h1>
          </div>
          <Link className={styles.backLink} to="/settings">
            返回设置
          </Link>
        </header>

        <div className={styles.form}>
          <label>
            <span>当前密码</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </label>
          <label>
            <span>新密码</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
          </label>
          <label>
            <span>确认新密码</span>
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </label>
        </div>

        {message && <p className={styles.message}>{message}</p>}

        <footer className={styles.footer}>
          <button disabled={isSaving} onClick={submit} type="button">
            {isSaving ? "保存中" : "保存新密码"}
          </button>
        </footer>
      </section>
    </main>
  );
}
