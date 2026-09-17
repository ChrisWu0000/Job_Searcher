import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type LatexSnippets, snippetPlaceholders } from "@/types/resume";

type SnippetKey = keyof LatexSnippets;

const snippetOrder: { key: SnippetKey; label: string; hint: string; rows: number }[] = [
  {
    key: "document",
    label: "Document",
    hint: "The whole file, including your header. Every section is pasted into <<body>>.",
    rows: 18,
  },
  { key: "section", label: "Section", hint: "Wraps the entries of one section.", rows: 5 },
  {
    key: "entry",
    label: "Entry",
    hint: "Used for education, work, leadership and award entries.",
    rows: 6,
  },
  { key: "project", label: "Project", hint: "Used for project entries.", rows: 6 },
  { key: "bullet", label: "Bullet", hint: "One bullet line.", rows: 2 },
  { key: "skills", label: "Skills section", hint: "Wraps every skill group.", rows: 6 },
  { key: "skillGroup", label: "Skill group", hint: "One skill group line.", rows: 2 },
];

export interface SnippetFieldsProps {
  snippets: LatexSnippets;
  onChange: (snippets: LatexSnippets) => void;
}

export function SnippetFields({ snippets, onChange }: SnippetFieldsProps) {
  return (
    <div className="space-y-4">
      {snippetOrder.map((snippet) => (
        <div key={snippet.key} className="space-y-2">
          <Label htmlFor={`snippet-${snippet.key}`}>{snippet.label}</Label>
          <p className="text-muted-foreground text-xs">
            {snippet.hint} Placeholders:{" "}
            <span className="font-mono">
              {snippetPlaceholders[snippet.key].map((name) => `<<${name}>>`).join(" ")}
            </span>
          </p>
          <Textarea
            id={`snippet-${snippet.key}`}
            className="font-mono text-xs"
            rows={snippet.rows}
            value={snippets[snippet.key]}
            onChange={(event) => {
              onChange({ ...snippets, [snippet.key]: event.target.value });
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default SnippetFields;
