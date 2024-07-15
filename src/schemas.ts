import * as v from 'valibot';
import { isAddress, isHex, type Address, type Hex } from 'viem';

export const JsonRpcSchema = v.object({
	jsonrpc: v.literal('2.0'),
	id: v.number(),
	method: v.string(),
	params: v.any(),
});
export type JsonRpcOutput = v.InferOutput<typeof JsonRpcSchema>;

const stringToBigIntTransform = v.pipe(
	v.string(),
	v.transform((value) => BigInt(value))
);
export const SendTransactionSchema = v.object({
	to: v.pipe(v.string(), v.check<Address>(isAddress)),
	data: v.pipe(v.string(), v.check<Hex>(isHex)),
	value: stringToBigIntTransform,
	gas: stringToBigIntTransform,
	maxPriorityFeePerGas: stringToBigIntTransform,
	maxFeePerGas: stringToBigIntTransform,
});
