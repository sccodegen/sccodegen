export async function callOpenAI({base, key, model}, messages, tools = []) {
    const body = {
        model: model,
        messages: messages,
        max_tokens: 16000
    };

    // 如果有工具定义，添加到请求中
    if (tools && tools.length > 0) {
        body.tools = tools;
    }

    const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(body)
    });

    const data = await resp.json();
    return data.choices[0].message;
}