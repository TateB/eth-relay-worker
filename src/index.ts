/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import * as v from 'valibot';
import { createClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getTransactionCount } from 'viem/actions';
import { potentiallySupportedChains } from './chains';
import { JsonRpcError } from './errors';
import { JsonRpcRouter } from './JsonRpcRouter';
import { SendTransactionSchema } from './schemas';

type ChainRpcMap = { [chainId: number]: string };
type NonceMap = { [chainId: number]: number };

const router = JsonRpcRouter();

router.post('/:apiKey/:chainId', async (request, env, ctx) => {
	const apiKey = request.params.apiKey as string | undefined;
	const apiSecret = request.headers.get('Authorization')?.split(' ')[1];
	if (!apiKey || !apiSecret)
		throw new JsonRpcError({
			code: -32000,
			message: 'API key and secret required',
		});

	const apiSecrets = JSON.parse(env.API_SECRETS) as { [apiKey: string]: string };
	if (apiSecret !== apiSecrets[apiKey])
		throw new JsonRpcError({
			code: -32000,
			message: 'Invalid API key and/or secret',
		});

	if (!env.CHAIN_RPC_MAP || !env.ETH_PRIVATE_KEY)
		throw new JsonRpcError({
			code: -32000,
			message: 'Server error',
		});

	const chainId = parseInt(request.params.chainId);

	if (!chainId)
		throw new JsonRpcError({
			code: -32000,
			message: 'Chain id required',
		});

	const chainRpcMap = JSON.parse(env.CHAIN_RPC_MAP) as ChainRpcMap;
	const httpEndpoint = chainRpcMap[chainId];
	const chain = potentiallySupportedChains[chainId as keyof typeof potentiallySupportedChains];

	if (!httpEndpoint || !chain)
		throw new JsonRpcError({
			code: -32000,
			message: 'Chain id not supported',
		});

	const account = privateKeyToAccount(env.ETH_PRIVATE_KEY);

	const client = createClient({
		transport: http(httpEndpoint),
		chain,
	});

	switch (request.jsonRpc.method) {
		case 'eth_chainId': {
			return chainId;
		}
		case 'eth_accounts': {
			return [account.address];
		}
		case 'eth_sendTransaction': {
			const fetchedNonceMap = await env.NONCE_KV.get<NonceMap>('nonceMap', 'json');
			const nonceMap = fetchedNonceMap || {};

			const sendTransactionParams = v.safeParse(SendTransactionSchema, request.jsonRpc.params);
			if (!sendTransactionParams.success)
				throw new JsonRpcError({
					code: -32602,
					message: 'Invalid params',
				});

			const [{ to, data, value, gas, maxPriorityFeePerGas, maxFeePerGas }] = sendTransactionParams.output;
			const account = privateKeyToAccount(env.ETH_PRIVATE_KEY);

			// NOTE: this doesn't really work if you're attempting to use any address that already had a non-zero nonce (i.e. interacted with a chain at least once)
			const nonce = nonceMap[chainId] || (await getTransactionCount(client, { address: account.address }));
			const whitelistedAddresses = JSON.parse(env.WHITELISTED_ADDRESSES) as Address[];
			const maxBaseFee = BigInt(env.MAX_BASE_FEE);

			whitelistCheck: {
				if (whitelistedAddresses.length === 0) break whitelistCheck;
				if (!whitelistedAddresses.includes(to))
					throw new JsonRpcError({
						code: -32000,
						message: 'Address not whitelisted',
					});
			}

			baseFeeLimitCheck: {
				if (maxBaseFee === 0n) break baseFeeLimitCheck;
				if (maxFeePerGas > maxBaseFee)
					throw new JsonRpcError({
						code: -32000,
						message: 'Max fee per gas too high',
					});
			}

			const signedTx = await account.signTransaction({
				to,
				data,
				value,
				gas,
				maxPriorityFeePerGas,
				maxFeePerGas,
				nonce,
				chainId,
			});

			// TODO: readd
			// const usePrivateTransactions = env.USE_PRIVATE_TRANSACTIONS === 'true';

			// if (usePrivateTransactions) {
			// 	const chainPrivateRpcMap = JSON.parse(env.CHAIN_PRIVATE_RPC_MAP) as ChainRpcMap;
			// 	const privateHttpEndpoint = chainPrivateRpcMap[chainId];

			// 	if (!privateHttpEndpoint)
			// 		throw new JsonRpcError({
			// 			code: -32000,
			// 			message: 'Chain id not supported for private transactions',
			// 		});

			// 	const privateClient = createClient({
			// 		transport: bundler(privateHttpEndpoint, {
			// 			account,
			// 		}),
			// 		chain,
			// 	});

			// 	const hash = await privateClient.request<{
			// 		Method: 'eth_sendPrivateRawTransaction';
			// 		Parameters: [
			// 			tx: Hex,
			// 			preferences?: {
			// 				fast: boolean; // Sends transactions to all registered block builders, sets MEV-Share revenue share to 50%
			// 				privacy?: {
			// 					// MEV-Share options; optional
			// 					hints?: Array<
			// 						// data about tx to share w/ searchers on mev-share
			// 						'contract_address' | 'function_selector' | 'calldata' | 'logs' | 'hash'
			// 					>;
			// 					builders?: Array<
			// 						// MEV-Share builders to exclusively receive bundles; optional
			// 						'default' | 'flashbots'
			// 					>;
			// 				};
			// 				validity?: {
			// 					refund?: Array<{ address: Address; percent: number }>;
			// 				};
			// 			}
			// 		];
			// 		ReturnType: Hash;
			// 	}>({
			// 		method: 'eth_sendPrivateRawTransaction',
			// 		params: [
			// 			signedTx,
			// 			{
			// 				fast: true,
			// 			},
			// 		],
			// 	});

			// 	return hash;
			// }

			const hash = await client.request({ method: 'eth_sendRawTransaction', params: [signedTx] });

			return hash;
		}
		default:
			throw new JsonRpcError({
				code: -32601,
				message: 'Method not found',
			});
	}
});

export default { ...router } satisfies ExportedHandler<Env>;
