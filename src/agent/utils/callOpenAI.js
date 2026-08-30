export async function callOpenAI(config = {}, messages = [], tools = []) {
    const {
        base,
        key,
        model,
        apiType = base && base.includes('puter') ? 'puter' : 'openai',
        puterAuthToken,
        provider,
        puter,
        ...rest
    } = config;

    let activePuter = globalThis?.puter || puter;

    if ((apiType === 'puter' || (typeof globalThis !== 'undefined' && globalThis.puter && globalThis.puter.ai)) && !activePuter && puterAuthToken) {
        try {
            const mod = await import('@heyputer/puter.js/src/init.cjs');
            activePuter = mod.init ? mod.init(puterAuthToken) : undefined;
            if (activePuter) {
                globalThis.puter = activePuter;
            }
        } catch (error) {
            // Ignore initialization errors here; the caller will get a clearer error below
        }
    }

    if (apiType === 'puter' || (activePuter && activePuter.ai)) {
        if (!activePuter) {
            throw new Error('Puter is not initialized. Provide globalThis.puter or config.puterAuthToken / config.puter.');
        }

        const chatOptions = {
            model: model || 'gpt-5-nano',
            ...(provider ? { provider } : {}),
            ...(tools && tools.length > 0 ? { tools } : {}),
            ...(rest.max_tokens ? { max_tokens: rest.max_tokens } : {}),
            ...(rest.temperature !== undefined ? { temperature: rest.temperature } : {}),
        };

        if (puterAuthToken && typeof activePuter?.setAuthToken === 'function') {
            activePuter.setAuthToken(puterAuthToken);
        }

        const response = await activePuter.ai.chat(messages, chatOptions);

        if (response && response.message) {
            return response.message;
        }

        if (response && response.choices && response.choices[0]?.message) {
            return response.choices[0].message;
        }

        if (typeof response === 'string') {
            return { role: 'assistant', content: response };
        }

        throw new Error('Puter AI response format is invalid');
    }

    const finalModel = model || 'gpt-4o-mini';
    const finalBase = base || 'https://api.openai.com/v1';
    const body = {
        model: finalModel,
        messages: messages,
        max_tokens: rest.max_tokens || 16000
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
    }

    if (rest.temperature !== undefined) {
        body.temperature = rest.temperature;
    }

    const resp = await fetch(`${finalBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI API request failed: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenAI API returned no choices');
    }

    return data.choices[0].message;
}