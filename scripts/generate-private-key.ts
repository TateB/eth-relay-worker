import clipboard from 'clipboardy';
import { generatePrivateKey } from 'viem/accounts';

const privateKey = generatePrivateKey();

clipboard.writeSync(privateKey);

console.log('Private key copied to clipboard');
