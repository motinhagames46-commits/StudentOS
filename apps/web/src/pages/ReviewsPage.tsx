import { QUIZ_MAX_QUESTIONS, QUIZ_MIN_QUESTIONS, type ReviewCardView } from '@studentos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AiUnavailable } from '../components/AiUnavailable';
import { ReviewSession } from '../components/ReviewSession';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormError,
  LoadingList,
  PageHeader,
  SelectField,
  Skeleton,
} from '../components/ui';
import { useAiStatus, useCreateQuiz, useDisciplines, useDocuments, useQuizzes, useReviewQueue } from '../hooks/queries';
import { errorMessage } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';

/** Revisões com repetição espaçada (FSRS) e quizzes gerados a partir dos documentos. */
export function ReviewsPage() {
  const ai = useAiStatus();
  return (
    <>
      <PageHeader
        title="Revisões"
        subtitle="Perguntas dos teus quizzes, repetidas no momento certo para não as esqueceres. Antes de uma avaliação, voltam mais vezes."
      />
      <div className="space-y-4">
        <ReviewCardSection />
        {ai.isPending ? (
          <Skeleton className="h-32" />
        ) : ai.data?.status === 'ENABLED' ? (
          <NewQuizCard />
        ) : (
          <AiUnavailable status={ai.data?.status} action="criar quizzes" />
        )}
        <QuizList />
      </div>
    </>
  );
}

function ReviewCardSection() {
  const queue = useReviewQueue();
  const queryClient = useQueryClient();
  // A sessão usa uma cópia da lista: recarregar a meio mudaria as perguntas debaixo dos pés.
  const [session, setSession] = useState<ReviewCardView[] | null>(null);

  if (session) {
    return (
      <ReviewSession
        cards={session}
        onDone={() => {
          setSession(null);
          void queryClient.invalidateQueries({ queryKey: ['reviews'] });
        }}
      />
    );
  }
  return (
    <Card title="Para rever hoje">
      {queue.error ? (
        <ErrorState message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <LoadingList rows={1} />
      ) : queue.data.dueCount === 0 ? (
        <p className="text-sm text-stone-600">
          Não tens revisões para agora.
          {queue.data.nextDue && ` A próxima é a ${formatDateTime(queue.data.nextDue)}.`}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-700">
            {queue.data.dueCount === 1 ? '1 pergunta à tua espera.' : `${queue.data.dueCount} perguntas à tua espera.`}
          </p>
          <Button onClick={() => setSession(queue.data.cards)}>Começar revisão</Button>
        </div>
      )}
    </Card>
  );
}

function NewQuizCard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const documents = useDocuments();
  const disciplines = useDisciplines();
  const create = useCreateQuiz();
  const fromFocus = params.get('disciplina');
  const [source, setSource] = useState(fromFocus ? `disc:${fromFocus}` : '');
  const [count, setCount] = useState('5');

  async function generate() {
    const [kind, id] = source.split(':');
    try {
      const quiz = await create.mutateAsync({
        ...(kind === 'doc' ? { documentId: Number(id) } : { disciplineId: Number(id) }),
        count: Number(count),
      });
      void navigate(`/revisoes/quiz/${quiz.id}`);
    } catch {
      // o erro fica visível no formulário
    }
  }

  const counts = Array.from({ length: QUIZ_MAX_QUESTIONS - QUIZ_MIN_QUESTIONS + 1 }, (_, i) => i + QUIZ_MIN_QUESTIONS);
  return (
    <Card title="Novo quiz">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <SelectField label="Sobre" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Escolhe um documento ou uma disciplina</option>
            {(disciplines.data?.length ?? 0) > 0 && (
              <optgroup label="Todos os documentos de uma disciplina">
                {disciplines.data?.map((d) => (
                  <option key={d.id} value={`disc:${d.id}`}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            {(documents.data?.length ?? 0) > 0 && (
              <optgroup label="Um documento">
                {documents.data?.map((doc) => (
                  <option key={doc.id} value={`doc:${doc.id}`}>
                    {doc.title}
                  </option>
                ))}
              </optgroup>
            )}
          </SelectField>
          <SelectField label="Perguntas" value={count} onChange={(e) => setCount(e.target.value)}>
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>
        </div>
        <FormError message={create.error ? errorMessage(create.error) : null} />
        <div aria-live="polite" className="flex flex-wrap items-center gap-3">
          <Button loading={create.isPending} disabled={!source} onClick={() => void generate()}>
            Gerar quiz
          </Button>
          {create.isPending && <span className="text-sm text-stone-600">A preparar as perguntas…</span>}
        </div>
        <p className="text-xs text-stone-600">
          O texto dos documentos vai para a Google (Gemini) para criar as perguntas. Revê-as: a IA pode enganar-se.
        </p>
      </div>
    </Card>
  );
}

function QuizList() {
  const quizzes = useQuizzes();
  return (
    <Card title="Quizzes">
      {quizzes.error ? (
        <ErrorState message={errorMessage(quizzes.error)} onRetry={() => void quizzes.refetch()} />
      ) : quizzes.isPending ? (
        <LoadingList rows={2} />
      ) : quizzes.data.length === 0 ? (
        <EmptyState message="Ainda não fizeste nenhum quiz." />
      ) : (
        <ul className="-my-2 divide-y divide-stone-100">
          {quizzes.data.map((q) => (
            <li key={q.id}>
              <Link
                to={`/revisoes/quiz/${q.id}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm hover:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-stone-900">{q.topic}</span>
                  <span className="text-xs text-stone-500">
                    {formatDate(q.createdAt)} · {q.questionCount} perguntas
                  </span>
                </span>
                {q.score === null ? <Badge tone="amber">Por responder</Badge> : <Badge>{q.score}%</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
