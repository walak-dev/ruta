import type { Adapter } from "../types.js";
type Sdk = {
    BedrockRuntimeClient: new (cfg: {
        region: string;
    }) => {
        send(cmd: unknown): Promise<unknown>;
    };
    ConverseCommand: new (input: unknown) => unknown;
};
/**
 * Amazon Bedrock Converse API. Install @aws-sdk/client-bedrock-runtime yourself
 * (optional peer dependency) or pass the SDK in. Credentials come from the AWS chain.
 */
export declare function bedrock(o: {
    region: string;
    sdk?: Sdk;
}): Adapter;
export {};
