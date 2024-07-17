import { HttpRequestError, keccak256, stringify, stringToHex, TimeoutError, withTimeout, type LocalAccount } from 'viem';
import type { HttpRpcClient, HttpRpcClientOptions } from 'viem/utils';
import { idCache } from './id';

type BundlerRpcClientOptions = HttpRpcClientOptions & {
	account: LocalAccount;
	authHeader?: string;
};

export function getBundlerRpcClient(url: string, options: BundlerRpcClientOptions): HttpRpcClient {
	return {
		async request(params) {
			const { body, onRequest = options.onRequest, onResponse = options.onResponse, timeout = options.timeout ?? 10_000 } = params;

			const fetchOptions = {
				...(options.fetchOptions ?? {}),
				...(params.fetchOptions ?? {}),
			};

			const { headers, method, signal: signal_ } = fetchOptions;

			try {
				const response = await withTimeout(
					async ({ signal }) => {
						const finalBody = Array.isArray(body)
							? stringify(
									body.map((body) => ({
										jsonrpc: '2.0',
										id: body.id ?? idCache.take(),
										...body,
									}))
							  )
							: stringify({
									jsonrpc: '2.0',
									id: body.id ?? idCache.take(),
									...body,
							  });
						const hashedRequest = keccak256(stringToHex(finalBody));
						const signedRequest = await options.account.signMessage({
							message: hashedRequest,
						});

						const init: RequestInit = {
							...fetchOptions,
							body: finalBody,
							headers: {
								...headers,
								'Content-Type': 'application/json',
								[options.authHeader || 'X-Flashbots-Signature']: `${options.account.address}:${signedRequest}`,
							},
							method: method || 'POST',
							signal: signal_ || (timeout > 0 ? signal : null),
						};
						const request = new Request(url, init);
						if (onRequest) await onRequest(request);
						const response = await fetch(url, init);
						return response;
					},
					{
						errorInstance: new TimeoutError({ body, url }),
						timeout,
						signal: true,
					}
				);

				if (onResponse) await onResponse(response as unknown as Response);

				let data: any;
				if (response.headers.get('Content-Type')?.startsWith('application/json')) data = await response.json();
				else {
					data = await response.text();
					data = JSON.parse(data || '{}');
				}

				if (!response.ok) {
					throw new HttpRequestError({
						body,
						details: stringify(data.error) || response.statusText,
						headers: response.headers as Response['headers'],
						status: response.status,
						url,
					});
				}

				return data;
			} catch (err) {
				if (err instanceof HttpRequestError) throw err;
				if (err instanceof TimeoutError) throw err;
				throw new HttpRequestError({
					body,
					cause: err as Error,
					url,
				});
			}
		},
	};
}
