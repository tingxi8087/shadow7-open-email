# Shadow7 Open Email

Shadow7 Open Email 是一个轻量的自建邮箱管理系统，目标是用 Docker 部署后提供基础收件、读信、写信和外发配置能力。

## 当前能力

- 单管理员登录。
- SQLite 持久化。
- 自写 SMTP 入站服务，支持 `*@你的域名` 收件。
- Web 邮箱首页、写邮件、邮件阅读。
- 支持 HTML 邮件安全渲染。
- 支持两种外发模式：
  - `direct`：直连收件方 MX 的 25 端口。
  - `smtp`：通过 SMTP Relay 服务商外发。
- 前后端一体化 Docker 镜像。

## 快速开始

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

访问：

```txt
http://服务器IP:5160
```

首次进入后创建管理员账号。

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

## 环境变量

见 [.env.example](./.env.example)。

重要配置：

```txt
COOKIE_SECURE=false
```

如果通过 HTTP 访问，必须保持 `false`。如果后续通过 HTTPS 访问，可以改为：

```txt
COOKIE_SECURE=true
```

否则浏览器不会在 HTTP 请求中发送登录 cookie，会导致登录后立刻掉线。

## 数据目录

Docker compose 默认挂载：

```txt
./data:/app/data
```

SQLite 数据库位于：

```txt
./data/shadow7-mail.sqlite
```

这个文件包含：

- 管理员账号。
- 系统配置。
- DKIM 私钥。
- 邮件数据。
- SMTP Relay 配置。

请务必备份 `data` 目录。删除该目录会丢失邮件、配置和 DKIM 私钥，可能导致已配置的 DKIM DNS 失效。

## DNS 基础配置

假设域名是：

```txt
example.com
```

服务器 IP 是：

```txt
1.2.3.4
```

最小收件配置：

| 类型 | 名称 | 内容 |
|---|---|---|
| A | `mail` | `1.2.3.4` |
| MX | `@` | `mail.example.com` |

推荐补充：

| 类型 | 名称 | 内容 |
|---|---|---|
| TXT | `@` | `v=spf1 ip4:1.2.3.4 mx -all` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` |

DKIM 记录由系统生成，后续可在设置/引导页中复制。

## 外发模式说明

### Direct

`direct` 模式会让服务器直接连接收件方 MX 的 `25` 端口。

要求：

- 云厂商允许出站 `25/tcp`。
- SPF 包含服务器 IP。
- DKIM 配置正确。
- 建议配置 PTR/rDNS。

腾讯云、阿里云、AWS 等云厂商经常限制出站 25。此时建议使用 SMTP Relay。

### SMTP Relay

`smtp` 模式会通过邮件服务商发信，例如 Resend、Mailgun、Amazon SES、阿里云邮件推送等。

常见配置：

```txt
Host=smtp.resend.com
Port=465
Secure=true
User=resend
Password=你的 API Key
```

SMTP Relay 密钥会存入 SQLite。生产环境请妥善保护数据库文件。

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

备份数据库：

```bash
mkdir -p backups
cp data/shadow7-mail.sqlite backups/shadow7-mail-$(date +%Y%m%d%H%M%S).sqlite
```

## 安全建议

- 部署到公网后请立即修改管理员密码。
- 建议通过 HTTPS 访问管理后台。
- 上 HTTPS 后设置 `COOKIE_SECURE=true`。
- 定期备份 `data` 目录。
- 不要公开 SQLite 数据库文件。

