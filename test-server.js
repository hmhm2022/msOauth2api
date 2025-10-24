const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static('public'));

// 加载所有 API 端点
const apis = [
    { path: '/api/token-info', file: './api/token-info', name: 'token-info' },
    { path: '/api/mail-new', file: './api/mail-new', name: 'mail-new' },
    { path: '/api/mail-all', file: './api/mail-all', name: 'mail-all' },
    { path: '/api/send-mail', file: './api/send-mail', name: 'send-mail' },
    { path: '/api/clear-inbox', file: './api/clear-inbox', name: 'clear-inbox' },
    { path: '/api/clear-junk', file: './api/clear-junk', name: 'clear-junk' },
    { path: '/api/delete-mail', file: './api/delete-mail', name: 'delete-mail' }
];

apis.forEach(api => {
    try {
        app.all(api.path, require(api.file));
        console.log(`✅ ${api.name} API 加载成功`);
    } catch (error) {
        console.error(`❌ ${api.name} API 加载失败:`, error.message);
    }
});

// 根路径重定向到首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'msOauth2api 本地测试服务器运行正常',
        timestamp: new Date().toISOString(),
        apis: [
            '/api/mail-new',
            '/api/mail-all',
            '/api/send-mail',
            '/api/clear-inbox',
            '/api/clear-junk',
            '/api/token-info',
            '/api/delete-mail'
        ]
    });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
});

app.listen(PORT, () => {
    console.log(`🚀 msOauth2api 测试服务器启动成功！`);
    console.log(`📍 本地地址: http://localhost:${PORT}`);
    console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
    console.log(`📚 API 文档: http://localhost:${PORT}`);
    console.log(`\n可用的 API 端点:`);
    console.log(`  GET/POST /api/mail-new     - 获取最新邮件`);
    console.log(`  GET/POST /api/mail-all     - 获取全部邮件`);
    console.log(`  GET/POST /api/send-mail    - 发送邮件`);
    console.log(`  GET/POST /api/clear-inbox  - 清空收件箱`);
    console.log(`  GET/POST /api/clear-junk   - 清空垃圾箱`);
    console.log(`  GET/POST /api/token-info   - Token 权限检测`);
    console.log(`  GET/POST /api/delete-mail  - 删除单个邮件`);
});
