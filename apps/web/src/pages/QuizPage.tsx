import type { QuizQuestionView, QuizResultQuestion, QuizVerdict } from '@studentos/shared';
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, Button, Card, ErrorState, FormError, LoadingList, PageHeader } from '../components/ui';
import { useAnswerQuiz, useQuiz } from '../hooks/queries';
import { errorMessage } from '../lib/api';

const verdicts: Record<QuizVerdict, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  correct: { label: 'Certa', tone: 'green' },
  partial: { label: 'Parcial', tone: 'amber' },
  wrong: { label: 'Errada', tone: 'red' },
};

/** Um quiz: responder (escolha múltipla e resposta curta) e ver a correção. */
export function QuizPage() {
  const id = Number(useParams().id);
  const quiz = useQuiz(id);

  if (!Number.isInteger(id) || id <= 0) return <ErrorState message="Quiz não encontrado" />;
  if (quiz.error) return <ErrorState message={errorMessage(quiz.error)} onRetry={() => void quiz.refetch()} />;
  if (quiz.isPending) return <LoadingList rows={3} />;
  const q = quiz.data;

  return (
    <>
      <Link to="/revisoes" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Revisões
      </Link>
      <PageHeader
        title={q.topic}
        subtitle={q.score === null ? `${q.questionCount} perguntas` : `Resultado: ${q.score}% certas`}
      />
      {q.answeredAt ? (
        <Results questions={q.questions as QuizResultQuestion[]} />
      ) : (
        <AnswerForm id={q.id} questions={q.questions as QuizQuestionView[]} />
      )}
    </>
  );
}

function AnswerForm({ id, questions }: { id: number; questions: QuizQuestionView[] }) {
  const answer = useAnswerQuiz(id);
  const [answers, setAnswers] = useState(() => questions.map(() => ({ choice: null as number | null, text: '' })));
  const set = (i: number, patch: Partial<(typeof answers)[number]>) =>
    setAnswers((current) => current.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  function submit(e: FormEvent) {
    e.preventDefault();
    answer.mutate({ answers: answers.map((a) => ({ choice: a.choice, text: a.text.trim() || null })) });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {questions.map((question, i) => (
        <Card key={i}>
          {question.kind === 'MCQ' ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium text-stone-900">
                {i + 1}. {question.question}
              </legend>
              {question.options.map((option, j) => (
                <label
                  key={j}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-stone-300 px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name={`q${i}`}
                    checked={answers[i]!.choice === j}
                    onChange={() => set(i, { choice: j })}
                    className="size-4 accent-accent"
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          ) : (
            <div>
              <label htmlFor={`q${i}`} className="mb-2 block font-medium text-stone-900">
                {i + 1}. {question.question}
              </label>
              <textarea
                id={`q${i}`}
                rows={3}
                maxLength={2000}
                value={answers[i]!.text}
                onChange={(e) => set(i, { text: e.target.value })}
                className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              />
            </div>
          )}
        </Card>
      ))}
      <FormError message={answer.error ? errorMessage(answer.error) : null} />
      <div aria-live="polite" className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={answer.isPending}>
          Corrigir
        </Button>
        {answer.isPending && <span className="text-sm text-stone-600">A corrigir…</span>}
      </div>
      <p className="text-xs text-stone-600">
        A escolha múltipla é corrigida pelo StudentOS; as respostas escritas são corrigidas pela IA (Google Gemini).
      </p>
    </form>
  );
}

function Results({ questions }: { questions: QuizResultQuestion[] }) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
        Estas perguntas entram agora nas tuas{' '}
        <Link to="/revisoes" className="font-medium underline">
          revisões
        </Link>
        : as que erraste voltam mais cedo.
      </p>
      {questions.map((q, i) => (
        <Card key={i}>
          <div className="space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium text-stone-900">
              <Badge tone={verdicts[q.verdict].tone}>{verdicts[q.verdict].label}</Badge>
              {i + 1}. {q.question}
            </p>
            {q.kind === 'MCQ' ? (
              <>
                <p>
                  <span className="text-stone-600">A tua resposta: </span>
                  {q.answer.choice === null ? 'em branco' : q.options[q.answer.choice]}
                </p>
                {q.verdict !== 'correct' && q.correctOption !== null && (
                  <p>
                    <span className="text-stone-600">Certa: </span>
                    {q.options[q.correctOption]}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap">
                  <span className="text-stone-600">A tua resposta: </span>
                  {q.answer.text ?? 'em branco'}
                </p>
                <p>
                  <span className="text-stone-600">Esperado: </span>
                  {q.expectedAnswer}
                </p>
                {q.feedback && <p className="text-stone-700">{q.feedback}</p>}
              </>
            )}
            {q.explanation && <p className="text-stone-600">{q.explanation}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}
