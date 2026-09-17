import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearApiKey, getApiKey, onApiKeyChanged, setApiKey } from "@/lib/storage/apiKey";

export function ApiKeyField() {
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [stored, setStored] = useState<string | undefined>(undefined);

  useEffect(() => {
    void getApiKey()
      .then((key) => {
        setStored(key);
        setValue(key ?? "");
      })
      .catch(() => undefined);
    return onApiKeyChanged((key) => {
      setStored(key);
    });
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor="api-key">OpenRouter API key</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="api-key"
          className="max-w-md font-mono"
          type={revealed ? "text" : "password"}
          autoComplete="off"
          placeholder="sk-or-v1-…"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRevealed((current) => !current);
          }}
        >
          {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          {revealed ? "Hide" : "Show"}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void setApiKey(value)
              .then(() => {
                toast.success("API key saved to this browser only");
              })
              .catch((cause: unknown) => {
                toast.error(errorMessage(cause));
              });
          }}
        >
          Save key
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void clearApiKey()
              .then(() => {
                setValue("");
                toast.success("API key cleared");
              })
              .catch((cause: unknown) => {
                toast.error(errorMessage(cause));
              });
          }}
        >
          Clear
        </Button>
        <span className="text-muted-foreground text-xs">
          {stored === undefined ? "No key stored" : "Key stored"}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        The key is kept in chrome.storage.local on this machine, is excluded from every export, and
        job text plus your profile are sent to OpenRouter and its upstream provider under their
        retention terms whenever you score a job.
      </p>
    </div>
  );
}

export default ApiKeyField;
