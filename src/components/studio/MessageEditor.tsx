import { AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { useId } from 'react';
import { MESSAGE_MAX_LENGTH, type MessageIssue } from '../../domain/message';
import { Card } from './Card';

export function MessageEditor({
  message,
  generated,
  issues,
  merchantName,
  editable,
  onChange,
}: {
  message: string;
  generated: string;
  issues: MessageIssue[];
  merchantName: string;
  editable: boolean;
  onChange: (message: string) => void;
}) {
  const id = useId();
  const over = message.length > MESSAGE_MAX_LENGTH;
  return (
    <Card
      id="message-title"
      label="Marketing copy · editable"
      title="Message"
      testId="message-editor"
      aside={
        <button
          type="button"
          onClick={() => onChange(generated)}
          disabled={!editable || message === generated}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          Reset to suggested
        </button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <label htmlFor={id} className="mb-1.5 block text-xs text-muted">
            Message text
          </label>
          <textarea
            id={id}
            value={message}
            disabled={!editable}
            onChange={(e) => onChange(e.target.value)}
            rows={6}
            aria-invalid={issues.length > 0}
            aria-describedby={`${id}-count ${id}-issues`}
            className={`w-full resize-y rounded-lg border bg-bg/60 px-3 py-2.5 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent disabled:opacity-60 ${
              issues.length > 0 ? 'border-danger' : 'border-border-strong'
            }`}
          />
          <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
            <p className="text-muted">Change the wording freely. To change amounts, edit the offer rules.</p>
            <p id={`${id}-count`} className={`shrink-0 tabular ${over ? 'text-danger' : 'text-muted'}`} data-testid="char-count">
              {message.length} / {MESSAGE_MAX_LENGTH}
            </p>
          </div>
          <div id={`${id}-issues`} aria-live="polite" className="mt-3">
            {issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-success" data-testid="message-ok">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                States the offer terms accurately
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-danger" data-testid="message-issues">
                {issues.map((i) => (
                  <li key={i.code} className="flex gap-1.5">
                    <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {i.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <figure className="min-w-0 rounded-xl border border-border bg-bg/50 p-4" aria-label="Message preview">
          <figcaption className="flex items-center justify-between text-[11px] text-muted">
            <span className="font-semibold tracking-wider text-simulated uppercase">Preview · not sent</span>
            <span>{merchantName}</span>
          </figcaption>
          <div className="mt-3 max-w-full rounded-2xl rounded-tl-sm bg-surface-raised px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-text" data-testid="message-preview">
            {message.trim() || <span className="text-muted italic">Your message will appear here.</span>}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            This prototype has no SMS or WhatsApp connection. Messages are never delivered.
          </p>
        </figure>
      </div>
    </Card>
  );
}
