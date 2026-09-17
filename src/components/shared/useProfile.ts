import { useLiveQuery } from "dexie-react-hooks";
import { getProfile } from "@/lib/db/repo";
import type { Profile } from "@/types/preferences";

export function useProfile(): Profile | undefined {
  return useLiveQuery(() => getProfile(), []);
}

export function useProfileVersion(): string | undefined {
  return useProfile()?.version;
}
