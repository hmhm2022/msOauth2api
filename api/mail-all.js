const Imap = require('node-imap');
const simpleParser = require("mailparser").simpleParser;
const { generateAuthString, get_access_token, graph_api } = require('./utils');

async function get_emails(access_token, mailbox) {

    if (!access_token) {
        console.log("Failed to obtain access token'");
        return;
    }

    try {
        let nextLink = `https://graph.microsoft.com/v1.0/me/mailFolders/${mailbox}/messages?$top=1000&$select=id,from,subject,bodyPreview,body,createdDateTime,internetMessageId`;
        let emails = [];

        while (nextLink) {
            const response = await fetch(nextLink, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    "Authorization": `Bearer ${access_token}`
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch emails: ${response.status}, ${errorText}`);
            }

            const responseData = await response.json();
            emails = emails.concat(responseData.value || []);
            nextLink = responseData['@odata.nextLink'] || null;
        }

        const response_emails = emails.map(item => {
            return {
                id: item['id'],
                messageId: item['internetMessageId'] || item['id'], // 完整的Message-ID
                send: item['from']['emailAddress']['address'],
                subject: item['subject'],
                text: item['bodyPreview'],
                html: item['body']['content'],
                date: item['createdDateTime'],
                mode: 'graph' // 标识使用的模式
            }
        })

        return response_emails

    } catch (error) {
        console.error('Error fetching emails:', error);
        return;
    }

}

function buildResponseData(mail, seqno) {
    const generatedId = `imap_${seqno}_${Date.now()}`;
    const headerMessageId = mail?.headers?.get?.('message-id');

    return {
        id: generatedId,
        messageId: mail?.messageId || headerMessageId || generatedId,
        send: mail?.from?.text || '',
        subject: mail?.subject || '',
        text: mail?.text || '',
        html: mail?.html || '',
        date: mail?.date || null,
        mode: 'imap',
        _imapSeqno: seqno
    };
}

module.exports = async (req, res) => {

    const { password } = req.method === 'GET' ? req.query : req.body;

    const expectedPassword = process.env.PASSWORD;

    if (password !== expectedPassword && expectedPassword) {
        return res.status(401).json({
            error: 'Authentication failed. Please provide valid credentials or contact administrator for access. Refer to API documentation for deployment details.'
        });
    }

    // 根据请求方法从 query 或 body 中获取参数
    let { refresh_token, client_id, email, mailbox } = req.method === 'GET' ? req.query : req.body;

    // 检查是否缺少必要的参数
    if (!refresh_token || !client_id || !email || !mailbox) {
        return res.status(400).json({ error: 'Missing required parameters: refresh_token, client_id, email, or mailbox' });
    }

    try {

        console.log("判断是否graph_api");
        const graph_api_result = await graph_api(refresh_token, client_id)

        if (graph_api_result.status) {

            console.log("是graph_api");

            if (mailbox != "INBOX" && mailbox != "Junk") {
                mailbox = "inbox";
            }

            if (mailbox == 'INBOX') {
                mailbox = 'inbox';
            }

            if (mailbox == 'Junk') {
                mailbox = 'junkemail';
            }

            const result = await get_emails(graph_api_result.access_token, mailbox);

            res.status(200).json(result);

            return
        }

        const access_token = await get_access_token(refresh_token, client_id);
        const authString = generateAuthString(email, access_token);

        const imap = new Imap({
            user: email,
            xoauth2: authString,
            host: 'outlook.office365.com',
            port: 993,
            tls: true
        });

        const emailList = [];
        let responseHandled = false;

        const sendResponse = (statusCode, data) => {
            if (responseHandled) {
                return;
            }

            responseHandled = true;

            if (statusCode === 200) {
                res.status(200).json(data);
                return;
            }

            res.status(statusCode).json(data);
        };

        imap.once("ready", async () => {
            try {
                // 动态打开指定的邮箱（如 INBOX 或 Junk）
                await new Promise((resolve, reject) => {
                    imap.openBox(mailbox, true, (err, box) => {
                        if (err) return reject(err);
                        resolve(box);
                    });
                });

                const results = await new Promise((resolve, reject) => {
                    imap.search(["ALL"], (err, results) => {
                        if (err) return reject(err);
                        resolve(results);
                    });
                });

                // 检查是否有邮件
                if (!results || results.length === 0) {
                    console.log(`${mailbox} 中没有邮件`);
                    sendResponse(200, []);
                    imap.end();
                    return;
                }

                console.log(`${mailbox} 中找到 ${results.length} 封邮件`);
                const parseTasks = [];
                const f = imap.fetch(results, { bodies: "" });

                f.on("message", (msg, seqno) => {
                    msg.on("body", (stream) => {
                        parseTasks.push(new Promise((resolve, reject) => {
                            simpleParser(stream, (err, mail) => {
                                if (err) {
                                    return reject(new Error(`Failed to parse message ${seqno}: ${err.message}`));
                                }

                                try {
                                    emailList.push(buildResponseData(mail, seqno));
                                    resolve();
                                } catch (parseError) {
                                    reject(new Error(`Failed to normalize message ${seqno}: ${parseError.message}`));
                                }
                            });
                        }));
                    });
                });

                await new Promise((resolve, reject) => {
                    f.once("error", reject);
                    f.once("end", resolve);
                });

                await Promise.all(parseTasks);
                sendResponse(200, emailList);
                imap.end();
            } catch (err) {
                imap.end();
                sendResponse(500, { error: err.message });
            }
        });

        imap.once('error', (err) => {
            console.error('IMAP error:', err);
            sendResponse(500, { error: err.message });
        });

        imap.once('end', () => {
            console.log('IMAP connection ended');
        });

        imap.connect();

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
};
