import { AppError, notFound } from "../lib/errors.js";
import { profileRepo, type ProfileRow } from "../repositories/profileRepo.js";
import { usernameHash } from "../chain.js";

/** API-facing shape (transformation layer: row → DTO, snake → camel). */
export interface ProfileDto {
  address: string;
  username: string | null;
  fullName: string;
  email: string | null;
  createdAt: string;
}

export const toProfileDto = (row: ProfileRow): ProfileDto => ({
  address: row.address,
  username: row.username,
  fullName: row.full_name,
  email: row.email,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

export const profileService = {
  async get(address: string): Promise<ProfileDto> {
    const row = await profileRepo.findByAddress(address);
    if (!row) throw notFound("profile");
    return toProfileDto(row);
  },

  /** Resolve the first existing profile across candidate addresses (one request, no 404 probing). */
  async resolve(addresses: string[]): Promise<ProfileDto> {
    const clean = [...new Set(addresses.map(a => a.toLowerCase()))].slice(0, 5);
    const row = await profileRepo.findFirstByAddresses(clean);
    if (!row) throw notFound("profile");
    return toProfileDto(row);
  },

  async upsertBase(input: { address: string; fullName: string; email?: string; privyUserId: string }): Promise<ProfileDto> {
    const result = await profileRepo.upsertBaseGuarded({
      address: input.address,
      fullName: input.fullName,
      email: input.email ?? null,
      privyUserId: input.privyUserId,
    });
    if ("conflict" in result) {
      throw new AppError("this wallet belongs to another user", 403, "address_owned_by_another_user");
    }
    return toProfileDto(result.row);
  },

  /**
   * Claim flow (DB-owned usernames): first-come-first-served in the usernames table.
   * Authorization: the wallet address binds to the first Privy user that claims it;
   * later writes from a different user are rejected (403).
   */
  async claimUsernameInDb(input: {
    address: string;
    username: string;
    fullName: string;
    email?: string;
    privyUserId: string;
  }): Promise<ProfileDto> {
    const username = input.username.toLowerCase();
    const row = await profileRepo.claimUsernameDb({
      address: input.address,
      username,
      fullName: input.fullName,
      email: input.email ?? null,
      privyUserId: input.privyUserId,
      usernameHash: usernameHash(username),
    });
    if (!row) {
      throw new AppError("username is already taken", 409, "username_taken");
    }
    if ("conflict" in row) {
      throw new AppError("this wallet belongs to another user", 403, "address_owned_by_another_user");
    }
    return toProfileDto(row);
  },
};
