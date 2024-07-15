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
import { createClient, http, type Address, type Hash, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sendTransaction } from 'viem/actions';
import { potentiallySupportedChains } from './chains';
import { JsonRpcError } from './errors';
import { JsonRpcRouter } from './JsonRpcRouter';
import { SendTransactionSchema } from './schemas';

type ChainIdMap = { [chainId: number]: string };
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

	if (!env.CHAIN_ID_MAP || !env.ETH_PRIVATE_KEY)
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

	const chainIdMap = JSON.parse(env.CHAIN_ID_MAP) as ChainIdMap;
	const httpEndpoint = chainIdMap[chainId];
	const chain = potentiallySupportedChains[chainId as keyof typeof potentiallySupportedChains];

	if (!httpEndpoint || !chain)
		throw new JsonRpcError({
			code: -32000,
			message: 'Chain id not supported',
		});

	const client = createClient({
		transport: http(httpEndpoint),
		chain,
	});

	switch (request.jsonRpc.method) {
		case 'eth_sendTransaction': {
			const fetchedNonceMap = await env.NONCE_KV.get<NonceMap>('nonceMap', 'json');
			const nonceMap = fetchedNonceMap || {};

			const sendTransactionParams = v.safeParse(SendTransactionSchema, request.jsonRpc.params);
			if (!sendTransactionParams.success)
				throw new JsonRpcError({
					code: -32602,
					message: 'Invalid params',
				});

			// NOTE: this doesn't really work if you're attempting to use any address that already had a non-zero nonce (i.e. interacted with a chain at least once)
			const nonce = nonceMap[chainId] || 0;
			const whitelistedAddresses = JSON.parse(env.WHITELISTED_ADDRESSES) as Address[];
			const maxBaseFee = BigInt(env.MAX_BASE_FEE);
			const usePrivateTransactions = env.USE_PRIVATE_TRANSACTIONS === 'true';

			{
				if (whitelistedAddresses.length === 0) break;
				if (!whitelistedAddresses.includes(sendTransactionParams.output.to))
					throw new JsonRpcError({
						code: -32000,
						message: 'Address not whitelisted',
					});
			}

			{
				if (maxBaseFee === 0n) break;
				if (sendTransactionParams.output.maxFeePerGas > maxBaseFee)
					throw new JsonRpcError({
						code: -32000,
						message: 'Max fee per gas too high',
					});
			}

			const { to, data, value, gas, maxPriorityFeePerGas, maxFeePerGas } = sendTransactionParams.output;

			const account = privateKeyToAccount(env.ETH_PRIVATE_KEY);

			if (usePrivateTransactions) {
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

				const hash = await client.request<{
					Method: 'eth_sendPrivateTransaction';
					Parameters: [
						{
							tx: Hex;
							maxBlockNumber?: Hex;
							preferences?: {
								fast: boolean; // Sends transactions to all registered block builders, sets MEV-Share revenue share to 50%
								privacy?: {
									// MEV-Share options; optional
									hints?: Array<
										// data about tx to share w/ searchers on mev-share
										'contract_address' | 'function_selector' | 'calldata' | 'logs' | 'hash'
									>;
									builders?: Array<
										// MEV-Share builders to exclusively receive bundles; optional
										'default' | 'flashbots'
									>;
								};
							};
						}
					];
					ReturnType: Hash;
				}>({
					method: 'eth_sendPrivateTransaction',
					params: [
						{
							tx: signedTx,
							preferences: {
								fast: true,
							},
						},
					],
				});

				return hash;
			}

			const hash = await sendTransaction(client, {
				to,
				data,
				value,
				gas,
				maxPriorityFeePerGas,
				maxFeePerGas,
				nonce,
				account,
			});

			return hash;
		}
		default:
			throw new JsonRpcError({
				code: -32601,
				message: 'Method not found',
			});
	}
});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
