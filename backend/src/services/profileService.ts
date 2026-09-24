import { AppError, notFound } from "../lib/errors.js";
import { profileRepo, type ProfileRow } from "../repositories/profileRepo.js";
import { usernameHash, verifyRegistrationTx } from "../chain.js";
import type { Hex } from "viem";

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
   * Claim flow: verify the mined registration tx binds `address` on-chain, record the
   * username in the registry cache, then persist the profile with username.
   * Authorization: the on-chain event owner must equal the claimed address.
   */
  async claimUsername(input: {
    address: string;
    username: string;
    txHash: string;
    fullName: string;
    email?: string;
    privyUserId: string;
  }): Promise<ProfileDto> {
    const verified = await verifyRegistrationTx(input.txHash as Hex, input.address);
    if (!verified) {
      throw new AppError("registration tx could not be verified on-chain", 400, "registration_not_verified");
    }
    if (verified.username !== input.username) {
      throw new AppError("registered username does not match request", 409, "username_mismatch", {
        expected: verified.username,
      });
    }
    const hash = usernameHash(verified.username);
    await profileRepo.upsertUsernameCache(verified.username, hash, input.address);
    const row = await profileRepo.claimUsername({
      address: input.address,
      username: verified.username,
      usernameHash: hash,
      fullName: input.fullName,
      email: input.email ?? null,
      privyUserId: input.privyUserId,
    });
    return toProfileDto(row);
  },
};
