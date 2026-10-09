import { AppError } from "../lib/errors.js";
import { profileRepo } from "../repositories/profileRepo.js";

/**
 * Address ownership guard. An address bound to a different Privy user is off-limits;
 * unbound addresses stay readable so a counterfactual smart account (not yet in a
 * profile row) keeps working for its owner.
 */
export async function assertAddressAccess(callerUserId: string, address: string): Promise<void> {
  const row = await profileRepo.findByAddress(address.toLowerCase());
  if (row?.privy_user_id && row.privy_user_id !== callerUserId) {
    throw new AppError("address belongs to another user", 403, "address_forbidden");
  }
}
