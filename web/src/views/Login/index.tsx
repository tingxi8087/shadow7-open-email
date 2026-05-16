import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { request } from "@/http/request";
import styles from "./index.module.less";

type SetupState = {
  initialized: boolean;
};

type AuthResponse = {
  ok: boolean;
  admin: {
    email: string;
    displayName: string | null;
  } | null;
};

export default function Login() {
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [email, setEmail] = useState("admin@shadow7.email");
  const [displayName, setDisplayName] = useState("Admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const state = await request.get<SetupState, SetupState>("/api/setup/state");
        setInitialized(state.initialized);

        if (state.initialized) {
          await request.get("/api/auth/me");
          navigate("/mailboxes", { replace: true });
        }
      } catch (error) {
        if (typeof error === "object" && error && "response" in error) {
          setInitialized(true);
          return;
        }

        setMessage("无法连接后端服务，请确认 API 已启动。");
        setInitialized(true);
      }
    }

    bootstrap();
  }, [navigate]);

  const isSetupMode = initialized === false;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (isSetupMode && password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = isSetupMode
        ? await request.post<AuthResponse, AuthResponse>("/api/setup/admin", {
            email,
            password,
            displayName,
          })
        : await request.post<AuthResponse, AuthResponse>("/api/auth/login", {
            email,
            password,
          });

      if (response.ok) {
        navigate(isSetupMode ? "/setup" : "/mailboxes", { replace: true });
      }
    } catch (error) {
      const fallback = isSetupMode ? "创建管理员失败。" : "登录失败。";
      if (typeof error === "object" && error && "response" in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response;
        setMessage(response?.data?.message || fallback);
      } else {
        setMessage(fallback);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="login-title">
        <header className={styles.brandBlock}>
          <div className={styles.brandMark} aria-hidden="true">
            <span />
          </div>
          <div>
            <p className={styles.eyebrow}>Shadow7 Mail</p>
            <h1 id="login-title">{isSetupMode ? "创建管理员" : "登录"}</h1>
          </div>
        </header>

        {initialized === null && <p className={styles.notice}>正在检查初始化状态...</p>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>管理员邮箱</span>
            <input
              autoComplete="username"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@shadow7.email"
              value={email}
              type="text"
            />
          </label>

          {isSetupMode && (
            <label className={styles.field}>
              <span>显示名称</span>
              <input
                autoComplete="name"
                name="displayName"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Admin"
                type="text"
                value={displayName}
              />
            </label>
          )}

          <label className={styles.field}>
            <span>密码</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入登录密码"
              type="password"
              value={password}
            />
          </label>

          {isSetupMode && (
            <label className={styles.field}>
              <span>确认密码</span>
              <input
                autoComplete="new-password"
                name="confirmPassword"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                type="password"
                value={confirmPassword}
              />
            </label>
          )}

          <div className={styles.formMeta}>
            {!isSetupMode && (
              <label className={styles.remember}>
                <input name="remember" type="checkbox" />
                <span className={styles.switch} aria-hidden="true" />
                <span>记住登录</span>
              </label>
            )}
            <a href="/setup">初始化配置</a>
          </div>

          {message && <p className={styles.message}>{message}</p>}

          <button className={styles.loginButton} disabled={isSubmitting || initialized === null} type="submit">
            {isSubmitting ? "处理中..." : isSetupMode ? "创建并继续" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}
