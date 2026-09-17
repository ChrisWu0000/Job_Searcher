import { SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { useProfile } from "@/components/shared/useProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { planScoringRun } from "@/engines/ScoringEngine";
import { formatUsd } from "@/lib/ai/cost";
import { saveProfile } from "@/lib/db/repo";
import { profileVersion } from "@/lib/ranking/profile";
import type { Profile, UnknownPayPolicy } from "@/types/preferences";
import ApiKeyField from "./ApiKeyField";
import ConstraintList from "./ConstraintList";
import DataSection from "./DataSection";
import ModelSection from "./ModelSection";

const payCurrencies = ["CAD", "USD"];

export default function SettingsPage() {
  const profile = useProfile();
  const [draft, setDraft] = useState<Profile | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [rescoreNotice, setRescoreNotice] = useState<string | undefined>(undefined);

  useEffect(() => {
    setDraft((current) => current ?? profile);
  }, [profile]);

  if (!draft) {
    return <p className="text-muted-foreground text-sm">Loading profile…</p>;
  }

  const patch = (values: Partial<Profile>) => {
    setDraft({ ...draft, ...values });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveProfile(draft);
      setDraft(saved);
      const plan = await planScoringRun();
      setRescoreNotice(
        plan.jobs.length === 0
          ? "Every job already has a score; existing scores are kept."
          : `Existing scores are kept. ${plan.jobs.length} unscored jobs will use this profile, est. ${formatUsd(plan.estimate.estimatedCostUsd)}`,
      );
      toast.success("Profile saved");
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const dirty = profile !== undefined && profileVersion(draft) !== profile.version;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Scoring is the only feature that needs a key; everything else works without one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ApiKeyField />
          <Separator />
          <ModelSection
            model={draft.model}
            reasoningEffort={draft.reasoningEffort}
            onModelChange={(model) => {
              patch({ model });
            }}
            onReasoningEffortChange={(reasoningEffort) => {
              patch({ reasoningEffort });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your requirements filter the Jobs list immediately, including jobs with older scores.
            Clear non-SWE roles and postings that fail pay requirements skip AI ranking. Existing
            model scores are kept; unscored jobs use the saved profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="resume-text">Resume or bio</Label>
            <Textarea
              id="resume-text"
              rows={10}
              value={draft.resumeText}
              placeholder="Paste your resume or a bio the model can judge your fit against"
              onChange={(event) => {
                patch({ resumeText: event.target.value });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reach-text">Reach</Label>
            <Textarea
              id="reach-text"
              rows={5}
              value={draft.reach}
              placeholder="What you want, how ambitious to be, dream job versus acceptable job"
              onChange={(event) => {
                patch({ reach: event.target.value });
              }}
            />
          </div>

          <ConstraintList
            constraints={draft.constraints}
            onChange={(constraints) => {
              patch({ constraints });
            }}
          />

          <div className="space-y-2">
            <Label>Hourly pay floors</Label>
            <p className="text-muted-foreground text-xs">
              Minimum guaranteed pay before tax: ranges use the lower end. Annual pay assumes 40
              hours a week for 52 weeks. Company reputation never waives the minimum.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {payCurrencies.map((currency) => (
                <div key={currency} className="flex items-center gap-2">
                  <span className="w-10 text-muted-foreground text-sm">{currency}</span>
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    value={String(draft.payFloors[currency] ?? "")}
                    onChange={(event) => {
                      const parsed = Number.parseFloat(event.target.value);
                      patch({
                        payFloors: {
                          ...draft.payFloors,
                          [currency]: Number.isNaN(parsed) ? 0 : parsed,
                        },
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>When pay cannot be parsed</Label>
            <p className="text-muted-foreground text-xs">
              Missing pay, university norms, competitive pay, and offers with only a maximum are
              hidden by default. Full posting fields are checked even when they contain long
              paragraphs.
            </p>
            <Select
              value={draft.unknownPay}
              onValueChange={(next) => {
                patch({ unknownPay: next as UnknownPayPolicy });
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llm">Send it to the model anyway</SelectItem>
                <SelectItem value="reject">Reject the posting</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={saving} onClick={() => void save()}>
              <SaveIcon className="size-4" />
              {saving ? "Saving…" : "Save profile"}
            </Button>
            <span className="font-mono text-muted-foreground text-xs">
              version {draft.version || "unset"}
              {dirty ? " (unsaved edits)" : ""}
            </span>
            {rescoreNotice ? <span className="text-sm">{rescoreNotice}</span> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>Export, import, or wipe the local database.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataSection />
        </CardContent>
      </Card>
    </div>
  );
}
