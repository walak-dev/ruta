/**
 * Amazon Bedrock Converse API. Install @aws-sdk/client-bedrock-runtime yourself
 * (optional peer dependency) or pass the SDK in. Credentials come from the AWS chain.
 */
export function bedrock(o) {
    let ready = null;
    const load = () => {
        if (!ready) {
            ready = (async () => {
                const name = '@aws-sdk/client-bedrock-runtime';
                const sdk = o.sdk ?? (await import(name));
                return { sdk, client: new sdk.BedrockRuntimeClient({ region: o.region }) };
            })();
        }
        return ready;
    };
    return async (c) => {
        const { sdk, client } = await load();
        const cmd = new sdk.ConverseCommand({
            modelId: c.model,
            messages: c.messages
                .filter((m) => m.role !== 'system')
                .map((m) => ({ role: m.role, content: [{ text: m.content }] })),
            ...(c.system ? { system: [{ text: c.system }] } : {}),
            inferenceConfig: { maxTokens: c.maxOutputTokens },
        });
        const out = (await client.send(cmd));
        const text = (out.output?.message?.content ?? []).map((b) => b.text ?? '').join('');
        return {
            text,
            ...(out.usage?.inputTokens != null ? { inTok: out.usage.inputTokens } : {}),
            ...(out.usage?.outputTokens != null ? { outTok: out.usage.outputTokens } : {}),
            ...(out.usage?.cacheReadInputTokens != null
                ? { cachedTok: out.usage.cacheReadInputTokens }
                : {}),
        };
    };
}
