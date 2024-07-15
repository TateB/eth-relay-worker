import {
	base,
	baseSepolia,
	holesky,
	linea,
	lineaSepolia,
	mainnet,
	optimism,
	optimismSepolia,
	scroll,
	scrollSepolia,
	sepolia,
} from 'viem/chains';

export const potentiallySupportedChains = {
	[mainnet.id]: mainnet,
	[sepolia.id]: sepolia,
	[holesky.id]: holesky,
	[base.id]: base,
	[baseSepolia.id]: baseSepolia,
	[optimism.id]: optimism,
	[optimismSepolia.id]: optimismSepolia,
	[scroll.id]: scroll,
	[scrollSepolia.id]: scrollSepolia,
	[linea.id]: linea,
	[lineaSepolia.id]: lineaSepolia,
};
