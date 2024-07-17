import { error, json, Router, withParams, type IRequestStrict } from 'itty-router';

import * as v from 'valibot';
import { jsonRpcError, JsonRpcError } from './errors';
import { JsonRpcOutput, JsonRpcSchema } from './schemas';

type JsonRpcRequest = IRequestStrict & { jsonRpc: JsonRpcOutput; error?: JsonRpcError };
type Args = [Env, ExecutionContext];

const withJsonRpc = async (request: JsonRpcRequest) => {
	const body = await request.json().catch(() => ({}));
	const params = v.safeParse(JsonRpcSchema, body);

	if (!params.success)
		throw new JsonRpcError({
			code: -32700,
			message: 'Parse error',
		});

	request.jsonRpc = params.output;
};

export const JsonRpcRouter = () =>
	Router<JsonRpcRequest, Args, any>({
		before: [withParams, withJsonRpc],
		catch: (error, request) => {
			console.log(error);
			if (error instanceof JsonRpcError) request.error = error;
			else request.error = new JsonRpcError({ code: -32000, message: 'Internal server error' });
		},
		finally: [
			(request: JsonRpcRequest) => request ?? error(404),
			(response: any, request: JsonRpcRequest) => {
				if (request.error)
					return jsonRpcError({ code: request.error.code, message: request.error.message, id: request.jsonRpc?.id ?? null });
				return json({ jsonrpc: '2.0', result: response, id: request.jsonRpc.id });
			},
		],
	});
