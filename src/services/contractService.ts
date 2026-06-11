import { ethers } from 'ethers';
import { config } from '../config.js';
import { getProvider, requireChain, toChecksumAddress } from '../blockchain.js';
import { logger } from '../logger.js';

/** ABI may be passed as human-readable signatures, a JSON ABI, or a single signature string. */
export type AbiInput = string | string[] | Array<Record<string, unknown>>;

export interface ReadContractInput {
  chainId: string;
  address: string;
  method: string;
  args?: unknown[];
  abi?: AbiInput;
}

/**
 * Calls a read-only (view/pure) method on a contract.
 *
 * The ABI can be supplied directly — which keeps the server zero-config — as
 * human-readable signatures, e.g.
 *   abi: ["function balanceOf(address) view returns (uint256)"]
 * If no ABI is given and an ETHERSCAN_API_KEY is configured, the verified ABI
 * is fetched automatically.
 */
export async function readContract(input: ReadContractInput): Promise<unknown> {
  requireChain(input.chainId);
  const address = toChecksumAddress(input.address);
  const provider = getProvider(input.chainId);

  const abi = await resolveAbi(input.chainId, address, input.abi);
  const contract = new ethers.Contract(address, abi, provider);

  const fn = contract.getFunction(input.method);
  if (!fn) {
    throw new Error(`Method "${input.method}" is not present in the provided ABI.`);
  }

  const result = await fn(...(input.args ?? []));
  return formatResult(result);
}

async function resolveAbi(chainId: string, address: string, abi?: AbiInput): Promise<ethers.InterfaceAbi> {
  if (abi) {
    return (typeof abi === 'string' ? [abi] : abi) as ethers.InterfaceAbi;
  }

  if (!config.etherscanApiKey) {
    throw new Error(
      'No ABI provided. Pass `abi` (e.g. ["function balanceOf(address) view returns (uint256)"]) ' +
        'or set ETHERSCAN_API_KEY to fetch verified ABIs automatically.',
    );
  }

  return fetchAbiFromEtherscan(chainId, address);
}

/** Fetches a verified contract ABI via the Etherscan v2 multichain API. */
async function fetchAbiFromEtherscan(chainId: string, address: string): Promise<ethers.InterfaceAbi> {
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${config.etherscanApiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Explorer request failed (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { status: string; result: string; message?: string };
  if (body.status !== '1' || !body.result) {
    throw new Error(
      `Could not fetch ABI for ${address}: ${body.message || 'contract may not be verified'}. ` +
        'You can also pass the `abi` argument directly.',
    );
  }

  logger.debug(`Fetched ABI for ${address} from Etherscan`);
  return JSON.parse(body.result) as ethers.InterfaceAbi;
}

/**
 * Makes ethers' return values JSON-serializable. BigInts become decimal
 * strings (NOT formatted as ether — that would corrupt token amounts and ids).
 */
function formatResult(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) return value.map(formatResult);

  if (value && typeof value === 'object') {
    // ethers Result objects expose named fields via toObject(); fall back to entries.
    const source =
      typeof (value as { toObject?: () => Record<string, unknown> }).toObject === 'function'
        ? (value as { toObject: () => Record<string, unknown> }).toObject()
        : (value as Record<string, unknown>);

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      if (!Number.isNaN(Number(key))) continue; // skip positional duplicates
      out[key] = formatResult(val);
    }
    return out;
  }

  return value;
}
