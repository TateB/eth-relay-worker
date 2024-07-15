import { json } from 'itty-router';

export class JsonRpcError extends Error {
	code: number;
	message: string;
	constructor({ code, message }: { code: number; message: string }) {
		super(message);
		this.code = code;
		this.message = message;
	}
}

export const jsonRpcError = ({ code, message, id }: { code: number; message: string; id: number | null }) =>
	json({
		jsonrpc: '2.0',
		error: { code, message },
		id,
	});
