import { stableObjectHash } from "@/lib/hash";
import type { Profile } from "@/types/preferences";

export function profileVersion(profile: Profile): string {
  return stableObjectHash({
    resumeText: profile.resumeText,
    reach: profile.reach,
    constraints: [...profile.constraints].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
    payFloors: profile.payFloors,
    unknownPay: profile.unknownPay,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
  });
}

export function withCurrentVersion(profile: Profile): Profile {
  return { ...profile, version: profileVersion(profile) };
}
