# Shadow7 Open Email

Shadow7 Open Email 是一个轻量的自建邮箱管理系统。它把 Web 邮箱界面、SMTP 入站收件、SQLite 持久化和外发配置放在一个 Docker 部署里，目标是让个人或小团队能用自己的域名跑一个简单、可控的邮箱入口。

这个项目目前更适合作为自托管邮件系统的基础版本，而不是大型邮件套件或企业邮件网关。

## 功能状态

已实现：

- 单管理员初始化、登录、退出和修改密码。
- Web 邮箱首页、邮件阅读、搜索、筛选、分页。
- 写邮件、发件箱、回收站。
- HTML 邮件安全渲染。
- 入站 SMTP 收件，支持接收 `*@你的域名`。
- 入站附件保存和下载。
- DNS 配置引导：MX、A、SPF、DKIM、DMARC 生成与检测。
- DKIM 密钥生成、重生成和外发签名。
- 两种外发模式：
  - `direct`：服务器直连收件方 MX 的 25 端口。
  - `smtp`：通过 SMTP Relay 服务商外发。
- 发件昵称、写信本地草稿。
- SQLite 数据持久化。
- 前后端一体化 Docker 镜像。

暂未实现或仍较基础：

- 写邮件附件。
- DMARC 报告箱。
- 多账号、多域名、权限管理。
- IMAP/POP3/JMAP。
- SMTP AUTH 对外开放。
- 邮件规则、标签、全文索引。
- Relay 密钥加密存储。

## 技术栈

- 后端：Bun、TypeScript、Fastify、Drizzle ORM、SQLite。
- 前端：React、Vite、TypeScript、Less。
- 邮件处理：`smtp-server`、`mailparser`、`nodemailer`、`dkim-signer`。
- 部署：Docker / Docker Compose。

## 快速开始

准备：

- 一台能被公网访问的服务器。
- 一个可配置 DNS 的域名。
- Docker 和 Docker Compose。

启动：

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

访问：

```txt
http://服务器IP:5160
```

首次进入后创建管理员账号，然后进入配置引导页填写：

- 主域名，例如 `example.com`
- 服务器公网 IPv4

系统会生成需要添加的 DNS 记录，并提供检测结果。

## 端口

| 端口 | 用途 |
|---:|---|
| `5160/tcp` | Web UI 和 API |
| `25/tcp` | SMTP 入站收件 |

云服务器安全组至少需要放行：

```txt
5160/tcp
25/tcp
```

如果只想本地体验 Web UI，可在 `.env` 中设置：

```txt
SMTP_INBOUND_ENABLED=false
```

## DNS 配置

假设：

- 域名：`example.com`
- 服务器 IP：`1.2.3.4`
- 邮件主机名：`mail.example.com`

基础收件记录：

| 类型 | 名称 | 内容 | 优先级 |
|---|---|---|---:|
| A | `mail` | `1.2.3.4` | - |
| MX | `@` | `mail.example.com` | `10` |

建议补充：

| 类型 | 名称 | 内容 |
|---|---|---|
| TXT | `@` | `v=spf1 ip4:1.2.3.4 mx -all` |
| TXT | `default._domainkey` | 由系统生成 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` |

推荐直接使用系统配置引导页生成和复制记录，避免手写出错。

## 外发模式

### Direct

`direct` 模式会让服务器直接连接收件方 MX 的 `25` 端口。

要求：

- 云厂商允许出站 `25/tcp`。
- SPF 包含服务器 IP。
- DKIM 配置正确。
- 建议配置 PTR/rDNS。

很多云厂商会限制出站 25 端口。遇到这种情况时，建议切换到 SMTP Relay。

### SMTP Relay

`smtp` 模式通过第三方邮件服务商发信，例如 Resend、Mailgun、Amazon SES、阿里云邮件推送等。

常见配置形式：

```txt
Host=smtp.resend.com
Port=465
Secure=true
User=resend
Password=你的 SMTP 密码或 API Key
```

不同服务商的 DNS 验证、额度和审核要求不同，请以服务商文档为准。

## 环境变量

完整示例见 [.env.example](./.env.example)。

常用配置：

| 变量 | 说明 |
|---|---|
| `PORT` | Web/API 端口，默认 `5160` |
| `DATABASE_PATH` | SQLite 数据库路径 |
| `ATTACHMENT_DIR` | 入站附件保存目录 |
| `SMTP_INBOUND_PORT` | SMTP 入站端口，默认 `25` |
| `SMTP_INBOUND_ENABLED` | 是否启用内置 SMTP 入站服务 |
| `SMTP_INBOUND_MAX_BYTES` | 单封入站邮件最大字节数 |
| `COOKIE_SECURE` | 是否只允许 HTTPS 发送登录 Cookie |
| `PUBLIC_HOST` | 可选，仅作为首次引导页预填服务器 IP |

如果通过 HTTP 访问，`COOKIE_SECURE` 必须保持：

```txt
COOKIE_SECURE=false
```

如果已经通过 HTTPS 访问，可以改为：

```txt
COOKIE_SECURE=true
```

## 数据与备份

Docker Compose 默认挂载：

```txt
./data:/app/data
```

关键数据包括：

- SQLite 数据库：`./data/shadow7-mail.sqlite`
- 入站附件：`./data/attachments`

SQLite 数据库中包含：

- 管理员账号。
- 系统配置。
- DKIM 私钥。
- 邮件数据。
- SMTP Relay 配置。

请定期备份 `data` 目录。删除该目录会丢失邮件、配置和 DKIM 私钥，可能导致已配置的 DKIM DNS 失效。

简单备份示例：

```bash
mkdir -p backups
cp data/shadow7-mail.sqlite backups/shadow7-mail-$(date +%Y%m%d%H%M%S).sqlite
```

如需完整备份附件，请同时备份：

```txt
data/attachments
```

## 常用命令

启动：

```bash
docker compose up -d
```

停止：

```bash
docker compose down
```

查看日志：

```bash
docker compose logs -f
```

重建：

```bash
docker compose build
docker compose up -d
```

## 本地开发

安装依赖后可分别启动后端和前端。

后端：

```bash
cd server
bun install
bun run dev
```

前端：

```bash
cd web
pnpm install
pnpm dev
```

构建前端：

```bash
pnpm --dir web build
```

后端类型检查：

```bash
bun --cwd server --check src/index.ts
```

## 安全说明

- 管理后台建议放在 HTTPS 后面。
- 上 HTTPS 后设置 `COOKIE_SECURE=true`。
- 不要公开 SQLite 数据库文件或 `data` 目录。
- SMTP Relay 密钥目前保存在 SQLite 中，请保护好数据库。
- 当前是单管理员系统，不适合开放注册或多租户使用。
- 如果使用 `direct` 外发，请确认服务器 IP 的发信信誉、SPF、DKIM 和 PTR/rDNS。

## 开源协议

本项目使用 [MIT License](./LICENSE)。
