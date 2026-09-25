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

  async upsertBase(input: { address: string; fullName: string; email?: string; privyUserId: string }): Promise<ProfileDto> {
    const row = await profileRepo.upsertBase({
      address: input.address,
      fullName: input.fullName,
      email: input.email ?? null,
      privyUserId: input.privyUserId,
    });
    return toProfileDto(row);
  },

  /**
   * Claim flow (DB-owned usernames): first-come-first-served in the usernames table.
   * Authorization: caller is authenticated; the address binds to the Privy user id.
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
    return toProfileDto(row);
  },
};
