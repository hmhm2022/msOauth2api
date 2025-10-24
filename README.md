# 微软 OAuth2 API 无服务器版本

> **本项目 Fork 自 [HChaoHui/msOauth2api](https://github.com/HChaoHui/msOauth2api)**
> **在原项目基础上增加了删除邮件、Token信息查询等功能**

🌟 **简化微软 OAuth2 认证流程，轻松集成到你的应用中！** 🌟

本项目将微软的 OAuth2 认证取件流程封装成一个简单的 API，并部署在 Vercel 的无服务器平台上。通过这个 API，你可以轻松地在你的应用中进行 OAuth2 取件功能。

## 🚀 快速开始

1. **Star 本项目**：首先，点击右上角的 `Star` 按钮，给这个项目点个赞吧！

2. **Fork 本项目**：点击右上角的 `Fork` 按钮，将项目复制到你的 GitHub 账户下。

3. **部署到 Vercel**：
   - 点击下面的按钮，一键部署到 Vercel。

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hmhm2022/msOauth2api)

   - 在 Vercel 部署页面，填写你的项目名称，然后点击 `Deploy` 按钮。

4. **配置环境变量**（可选）：
   - 在 Vercel 项目设置中，进入 `Settings` → `Environment Variables`
   - 添加环境变量 `PASSWORD`，设置你的 API 访问密码
   - **如果不设置密码，API 将不进行密码验证（公开访问）**
   - **建议设置密码以保护你的 API 安全**

5. **开始使用**：
   - 部署完成后，你可以通过访问 `https://your-vercel-app.vercel.app` 查看接口文档来进行使用。
   - **注意**：Vercel 的链接在国内可能无法访问，请使用自己的域名进行 CNAME 解析或使用 Cloudflare 进行代理。

## 📚 API 文档

### 📧 获取最新的一封邮件

- **方法**: `GET`
- **URL**: `/api/mail-new`
- **描述**: 获取最新的一封邮件。如果邮件中含有6位数字验证码，会自动提取。支持 Graph API 和 IMAP 两种模式。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (必填): 邮箱地址。
  - `mailbox` (必填): 邮箱文件夹，支持的值为 `INBOX` 或 `Junk`。
  - `response_type` (可选): 返回格式，支持的值为 `json` 或 `html`，默认为 `json`。

### 📨 获取全部邮件

- **方法**: `GET`
- **URL**: `/api/mail-all`
- **描述**: 获取全部邮件。如果邮件中含有6位数字验证码，会自动提取。支持 Graph API 和 IMAP 两种模式。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (必填): 邮箱地址。
  - `mailbox` (必填): 邮箱文件夹，支持的值为 `INBOX` 或 `Junk`。

### 📤 发送邮件

- **方法**: `GET` 或 `POST`
- **URL**: `/api/send-mail`
- **描述**: 支持 Microsoft Graph API 发送邮件。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (必填): 发件人邮箱地址。
  - `to` (必填): 收件人邮箱地址。
  - `subject` (必填): 邮件主题。
  - `body` (必填): 邮件正文。

### 🗑️ 清空收件箱

- **方法**: `GET` 或 `POST`
- **URL**: `/api/clear-inbox`
- **描述**: 清空收件箱中的所有邮件。支持 Graph API 和 IMAP 两种模式。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (必填): 邮箱地址。

### 🗑️ 清空垃圾箱

- **方法**: `GET` 或 `POST`
- **URL**: `/api/clear-junk`
- **描述**: 清空垃圾箱中的所有邮件。支持 Graph API 和 IMAP 两种模式。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (必填): 邮箱地址。

### ❌ 删除指定邮件

- **方法**: `GET` 或 `POST`
- **URL**: `/api/delete-mail`
- **描述**: 删除指定的邮件。支持 Graph API 和 IMAP 两种模式。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (必填): 邮箱地址。
  - `message_id` (必填): 要删除的邮件 ID。
  - `mailbox` (可选): 邮箱文件夹，默认为 `INBOX`。

### 🔑 获取 Token 信息

- **方法**: `GET` 或 `POST`
- **URL**: `/api/token-info`
- **描述**: 获取访问令牌和相关信息，检测 Graph API 支持状态。
- **参数说明**:
  - `password` (可选): API 访问密码。如果在 Vercel 中设置了 `PASSWORD` 环境变量，则此参数必填。
  - `refresh_token` (必填): 用于身份验证的 refresh_token。
  - `client_id` (必填): 客户端 ID。
  - `email` (可选): 邮箱地址。

## 🔐 安全说明

本项目支持可选的密码保护功能：

### 密码验证逻辑

1. **不设置密码**（默认）：
   - 不在 Vercel 中配置 `PASSWORD` 环境变量
   - API 调用时不需要 `password` 参数
   - **任何人都可以访问你的 API**（不推荐）

2. **设置密码**（推荐）：
   - 在 Vercel 项目设置中配置环境变量 `PASSWORD`
   - 所有 API 调用时必须传递正确的 `password` 参数
   - 密码错误将返回 401 错误

### 环境变量说明

- `PASSWORD`: 用于所有 API 的密码保护（包括发送邮件）

### 示例请求

**不使用密码**：
```bash
# GET 请求
https://your-app.vercel.app/api/mail-new?refresh_token=xxx&client_id=xxx&email=xxx&mailbox=INBOX
```

**使用密码**：
```bash
# GET 请求
https://your-app.vercel.app/api/mail-new?password=your_password&refresh_token=xxx&client_id=xxx&email=xxx&mailbox=INBOX

# POST 请求
curl -X POST https://your-app.vercel.app/api/mail-new \
  -H "Content-Type: application/json" \
  -d '{
    "password": "your_password",
    "refresh_token": "xxx",
    "client_id": "xxx",
    "email": "xxx@outlook.com",
    "mailbox": "INBOX"
  }'
```

## 🖼️ 效果图

![Demo](https://raw.githubusercontent.com/HChaoHui/msOauth2api/refs/heads/main/img/demo.png)

## 🤝 贡献

**原项目**：[HChaoHui/msOauth2api](https://github.com/HChaoHui/msOauth2api)
**原作者邮箱**：[z@unix.xin](mailto:z@unix.xin)

## 📜 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 💖 支持

如果你喜欢本项目，欢迎给它一个 Star ⭐️！

如果想支持原作者，可以访问：[原项目](https://github.com/HChaoHui/msOauth2api)

**Happy Coding!** 🎉