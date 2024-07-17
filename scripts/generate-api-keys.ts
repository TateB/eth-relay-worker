import clipboard from 'clipboardy';
import { generateApiKey } from 'generate-api-key';

const args = process.argv.slice(2);

if (args.length !== 1) {
	console.log('Usage: generate-api-keys <number>');
	process.exit(1);
}

const number = parseInt(args[0]);

if (isNaN(number)) {
	console.log('Invalid number');
	process.exit(1);
}

const apiKeys = generateApiKey({ method: 'uuidv4', batch: number, prefix: 'public', dashes: false }) as string[];
const apiSecrets = Object.fromEntries(
	apiKeys.map((apiKey) => [apiKey, generateApiKey({ method: 'uuidv4', prefix: 'secret', dashes: false })])
);

clipboard.writeSync(JSON.stringify(apiSecrets));

const s = number === 1 ? '' : 's';
console.log(`${number} API key${s} and secret${s} copied to clipboard`);
