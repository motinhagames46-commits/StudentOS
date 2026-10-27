// Uma sessão de revisão: uma pergunta de cada vez, e a avaliação (1–4) agenda a próxima com o FSRS.
// A escolha múltipla é corrigida aqui; a resposta curta é autoavaliada depois de ver a esperada (sem IA).
import type { ReviewCardView } from '@studentos/shared';
import { Check, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useDeleteCard, useReviewCard } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { Button, Card } from './ui';

const ratings = [
  { value: 1, label: 'Errei' },
  { value: 2, label: 'Difícil' },
  { value: 3, label: 'Bem' },
  { value: 4, label: 'Fácil' },
] as const;

export function ReviewSession({ cards, onDone }: { cards: ReviewCardView[]; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const review = useReviewCard();
  const remove = useDeleteCard();
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const card = cards[index]!;

  function next() {
    setChoice(null);
    setText('');
    setRevealed(false);
    if (index + 1 < cards.length) setIndex(index + 1);
    else {
      toast({ message: 'Revisão feita. As próximas datas já estão marcadas.' });
      onDone();
    }
  }

  async function rate(rating: number) {
    try {
      await review.mutateAsync({ id: card.id, rating });
      next();
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  }

  async function deleteCard() {
    const ok = await confirm({
      title: 'Apagar esta pergunta?',
      message: 'Deixa de aparecer nas revisões. O histórico dela também é apagado.',
      confirmLabel: 'Apagar pergunta',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(card.id);
      next();
    } catch (err) {
      toast({ message: errorMessage(err) });
    }
  }

  const right = card.kind === 'MCQ' && choice === card.correctOption;
  return (
    <Card
      title={`Revisão · ${index + 1} de ${cards.length}`}
      action={
        <Button variant="ghost" onClick={onDone}>
          Terminar
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-base font-medium text-stone-900">{card.question}</p>

        {card.kind === 'MCQ' ? (
          <ul className="space-y-2">
            {card.options.map((option, i) => {
              const state = !revealed ? '' : i === card.correctOption ? 'correct' : i === choice ? 'wrong' : '';
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={revealed}
                    onClick={() => {
                      setChoice(i);
                      setRevealed(true);
                    }}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${
                      state === 'correct'
                        ? 'border-green-600 bg-green-50 text-green-900'
                        : state === 'wrong'
                          ? 'border-red-400 bg-red-50 text-red-900'
                          : 'border-stone-300 bg-white hover:bg-stone-50'
                    }`}
                  >
                    {state === 'correct' && <Check aria-label="Certa" className="size-4 shrink-0" />}
                    {state === 'wrong' && <X aria-label="A tua escolha, errada" className="size-4 shrink-0" />}
                    {option}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div>
            <label htmlFor="review-answer" className="mb-1 block font-medium text-stone-700">
              A tua resposta (opcional)
            </label>
            <textarea
              id="review-answer"
              rows={3}
              value={text}
              disabled={revealed}
              onChange={(e) => setText(e.target.value)}
              className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
          </div>
        )}

        {revealed && (
          <div aria-live="polite" className="space-y-2 rounded-lg bg-stone-50 p-3">
            {card.kind === 'MCQ' ? (
              <p className="font-medium">{right ? 'Certo!' : 'Não é essa.'}</p>
            ) : (
              <p>
                <span className="font-medium">Resposta esperada: </span>
                {card.expectedAnswer}
              </p>
            )}
            {card.explanation && <p className="text-stone-700">{card.explanation}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!revealed ? (
            card.kind === 'SHORT' && <Button onClick={() => setRevealed(true)}>Ver resposta</Button>
          ) : card.kind === 'MCQ' ? (
            <Button loading={review.isPending} onClick={() => void rate(right ? 3 : 1)}>
              Seguinte
            </Button>
          ) : (
            <div role="group" aria-label="Como correu?" className="grid w-full grid-cols-4 gap-2 sm:w-auto">
              {ratings.map((r) => (
                <Button
                  key={r.value}
                  variant={r.value === 1 ? 'secondary' : 'primary'}
                  disabled={review.isPending}
                  onClick={() => void rate(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" disabled={remove.isPending} onClick={() => void deleteCard()}>
          <Trash2 aria-hidden="true" className="size-4" />
          Apagar esta pergunta
        </Button>
      </div>
    </Card>
  );
}
