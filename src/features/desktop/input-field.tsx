import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

export type InputFieldProps = ComponentPropsWithRef<'input'> & {
  label: string;
  labelHidden?: boolean;
  suffix?: string;
  rightAddon?: ReactNode;
  error?: string;
  hint?: string;
};

export function InputField({ label, labelHidden, suffix, rightAddon, error, hint, id: providedId, className = '', ...props }: InputFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const description = [props['aria-describedby'], suffix && id + '-suffix', (error || hint) && id + '-feedback'].filter(Boolean).join(' ') || undefined;

  return <div className="desktop-field ui:min-w-0">
    <label htmlFor={id} className={labelHidden ? 'ui:sr-only' : undefined}>{label}</label>
    <div className="desktop-input-control ui:box-border ui:flex ui:min-w-0 ui:items-center ui:overflow-hidden ui:rounded-md ui:border ui:border-solid ui:border-[color:var(--color-control-border)] ui:bg-[var(--color-background)] ui:text-[color:var(--color-text)] ui:focus-within:border-[color:var(--color-accent)] ui:focus-within:shadow-[0_0_0_3px_var(--color-focus-ring)] ui:data-[invalid=true]:border-[color:var(--color-danger)] ui:data-[disabled=true]:opacity-50"
      data-invalid={!!error || props['aria-invalid'] === true || props['aria-invalid'] === 'true'} data-disabled={props.disabled || undefined}>
      <input {...props} id={id} data-dialog-autofocus={props.autoFocus || undefined} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={description}
        className={'ui:box-border ui:h-[34px] ui:min-w-0 ui:w-full ui:flex-1 ui:border-0 ui:bg-transparent ui:px-3 ui:py-0 ui:outline-none ui:disabled:cursor-not-allowed ' + className} />
      {suffix && <span id={id + '-suffix'} className="ui:shrink-0 ui:select-none ui:whitespace-nowrap ui:pl-2 ui:pr-3 ui:text-right ui:text-[12px] ui:text-[color:var(--color-muted)]">{suffix}</span>}
      {rightAddon && <div className="desktop-input-addon ui:flex ui:shrink-0 ui:items-center ui:gap-1 ui:pr-1 ui:text-[color:var(--color-secondary)]" inert={props.disabled || undefined}>{rightAddon}</div>}
    </div>
    {error ? <span id={id + '-feedback'} className="desktop-error">{error}</span> : hint && <span id={id + '-feedback'} className="desktop-hint">{hint}</span>}
  </div>;
}
