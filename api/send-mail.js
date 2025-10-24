const { get_access_token } = require('./utils');

module.exports = async (req, res) => {

    const { password } = req.method === 'GET' ? req.query : req.body;

    const expectedPassword = process.env.PASSWORD;

    if (password !== expectedPassword && expectedPassword) {
        return res.status(401).json({
            error: 'Authentication failed. Please provide valid credentials or contact administrator for access. Refer to API documentation for deployment details.'
        });
    }

    if (req.method === 'GET' || req.method === 'POST') {
        try {
            // 从查询参数或请求体中获取参数
            const {
                refresh_token,
                client_id,
                email,
                to,
                subject,
                text,
                html
            } = req.method === 'GET' ? req.query : req.body;

            // 检查必传参数
            if (!refresh_token || !client_id || !email || !to || !subject || (!text && !html)) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            // 获取 access_token
            const access_token = await get_access_token(refresh_token, client_id);

            // 准备收件人列表
            const toRecipients = to.split(',').map(recipient => ({
                emailAddress: {
                    address: recipient.trim()
                }
            }));

            // 准备邮件内容
            const emailMessage = {
                message: {
                    subject: subject,
                    body: {
                        contentType: html ? 'HTML' : 'Text',
                        content: html || text
                    },
                    toRecipients: toRecipients
                }
            };

            // 使用 Microsoft Graph API 发送邮件
            const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(emailMessage)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to send email: ${response.status}, ${errorText}`);
            }

            // Graph API 成功发送邮件后不返回消息ID，所以我们生成一个唯一标识符
            const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
            res.status(200).json({ message: 'Email sent successfully', messageId: messageId });
        } catch (error) {
            console.error('Error sending email:', error);
            res.status(500).json({ error: 'Failed to send email', details: error.message });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};
