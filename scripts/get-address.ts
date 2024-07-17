import type { Hex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

const args = process.argv.slice(2);

if (args.length !== 1) {
	console.log('Usage: get-address <0x-address>');
	process.exit(1);
}

const privateKey = args[0];
const address = privateKeyToAddress(privateKey as Hex);

console.log(`Public address: ${address}`);
