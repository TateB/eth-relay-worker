import { createTransport, RpcRequestError, UrlRequiredError, type HttpTransport, type HttpTransportConfig, type LocalAccount } from 'viem';
import { getBundlerRpcClient } from './util';

type BundlerRpcClientOptions = HttpTransportConfig & {
	account: LocalAccount;
	authHeader?: string;
};

/**
 * @description Creates a HTTP transport that connects to a JSON-RPC API.
 */
export function bundler(
	/** URL of the JSON-RPC API. Defaults to the chain's public RPC URL. */
	url: string | undefined,
	config: BundlerRpcClientOptions
): HttpTransport {
	const {
		account,
		authHeader,
		batch,
		fetchOptions,
		key = 'http',
		name = 'HTTP JSON-RPC',
		onFetchRequest,
		onFetchResponse,
		retryDelay,
	} = config;
	return ({ chain, retryCount: retryCount_, timeout: timeout_ }) => {
		const { batchSize = 1000, wait = 0 } = typeof batch === 'object' ? batch : {};
		const retryCount = config.retryCount ?? retryCount_;
		const timeout = timeout_ ?? config.timeout ?? 10_000;
		const url_ = url || chain?.rpcUrls.default.http[0];
		if (!url_) throw new UrlRequiredError();

		const rpcClient = getBundlerRpcClient(url_, {
			fetchOptions,
			onRequest: onFetchRequest,
			onResponse: onFetchResponse,
			timeout,
			account,
			authHeader,
		});

		return createTransport(
			{
				key,
				name,
				async request({ method, params }) {
					const body = { method, params };

					const { error, result } = await rpcClient.request({
						body,
					});
					if (error)
						throw new RpcRequestError({
							body,
							error,
							url: url_,
						});
					return result;
				},
				retryCount,
				retryDelay,
				timeout,
				type: 'http',
			},
			{
				fetchOptions,
				url: url_,
			}
		);
	};
}
