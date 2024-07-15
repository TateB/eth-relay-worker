import { json, Router, withParams, type IRequestStrict } from 'itty-router';

import * as v from 'valibot';
import { jsonRpcError, JsonRpcError } from './errors';
import { JsonRpcOutput, JsonRpcSchema } from './schemas';

type JsonRpcRequest = IRequestStrict & { jsonRpc: JsonRpcOutput; error?: JsonRpcError };
type Args = [Env, ExecutionContext];

const withJsonRpc = async (request: JsonRpcRequest) => {
	const params = v.safeParse(JsonRpcSchema, await request.json());

	if (!params.success)
		throw new JsonRpcError({
			code: -32700,
			message: 'Parse error',
		});

	request.jsonRpc = params.output;
};

export const JsonRpcRouter = () =>
	Router<JsonRpcRequest, Args, any>({
		before: [
			// @ts-ignore
			withParams,
			withJsonRpc,
		],
		// @ts-ignore
		catch: (error, request) => {
			if (error instanceof JsonRpcError) request.error = error;
			else request.error = new JsonRpcError({ code: -32000, message: 'Internal server error' });
		},
		finally: [
			// @ts-ignore
			(r: any, ...args) => r ?? missing(r, ...args),
			(r) => {
				if (r.error) return jsonRpcError({ code: r.error.code, message: r.error.message, id: r.jsonRpc?.id ?? null });
				return json({ jsonrpc: '2.0', result: r, id: r.jsonRpc.id });
			},
		],
	});
