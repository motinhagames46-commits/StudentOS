import type { RefObject } from 'react';
import { Button } from '../ui';

export type HeadingRef = RefObject<HTMLHeadingElement | null>;
export function StepHeader({ headingRef, title, why }: { headingRef: HeadingRef; title: string; why: string }) {
  return (
    <div className="mb-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight text-stone-900 outline-none">
        {title}
      </h1>
      <p className="mt-1 text-sm text-stone-600">{why}</p>
    </div>
  );
}

export function StepActions({
  saving,
  skip,
  label = 'Continuar',
}: {
  saving: boolean;
  skip?: () => void;
  label?: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
      {skip && (
        <Button type="button" variant="ghost" onClick={skip}>
          Saltar este passo
        </Button>
      )}
      <Button type="submit" loading={saving}>
        {label}
      </Button>
    </div>
  );
}
