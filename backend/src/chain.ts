import { createPublicClient, http, keccak256, toHex, decodeEventLog, type Hex } from "viem";
import { config } from "./config.js";

export const publicClient = createPublicClient({
  transport: http(config.chain.rpcUrl),
});

export function usernameHash(username: string): Hex {
  return keccak256(toHex(username.toLowerCase()));
}

const registryAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "usernameHash", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const usernameRegisteredAbi = [
  {
    type: "event",
    name: "UsernameRegistered",
    inputs: [
      { name: "usernameHash", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "username", type: "string", indexed: false },
    ],
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function requireRegistry(): Hex {
  const registry = config.contracts.registry;
  if (!registry) throw new Error("registry_not_configured");
  return registry as Hex;
}

/** Returns the owning address for a registered username, or null if unregistered. */
export async function resolveUsernameOnChain(username: string): Promise<string | null> {
  const registry = requireRegistry();
  const owner = (await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: [usernameHash(username)],
  })) as string;
  return owner && owner.toLowerCase() !== ZERO_ADDRESS ? owner : null;
}

/**
 * Verify that a mined tx registered `expectedOwner` on the UsernameRegistry.
 * Returns the registered username on success, null otherwise.
 */
export async function verifyRegistrationTx(
  txHash: Hex,
  expectedOwner: string,
): Promise<{ username: string } | null> {
  const registry = requireRegistry();
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: usernameRegisteredAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "UsernameRegistered") continue;
      const owner = (decoded.args as { owner: string }).owner;
      const username = (decoded.args as { username: string }).username;
      if (owner.toLowerCase() !== expectedOwner.toLowerCase()) continue;
      return { username: username.toLowerCase() };
    } catch {
      continue;
    }
  }
  return null;
}
