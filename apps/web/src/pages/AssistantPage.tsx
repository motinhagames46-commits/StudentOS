import { assistantAskSchema, type AssistantAnswer } from '@studentos/shared';
import { ExternalLink, FileText, Send } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { AiUnavailable } from '../components/AiUnavailable';
import { Badge, Button, Card, FormError, PageHeader, SelectField, Skeleton } from '../components/ui';
import { useAiStatus, useAskAssistant, useDisciplines } from '../hooks/queries';
import { errorMessage } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  answer?: AssistantAnswer;
}

/** Assistente sobre os documentos lidos, com fontes; a conversa vive só nesta página. */
export function AssistantPage() {
  const ai = useAiStatus();
  return (
    <>
      <PageHeader
        title="Assistente"
        subtitle="Pergunta sobre os teus documentos. Quando não chegam, a resposta vem da web e fica marcada como tal."
      />
      {ai.isPending ? (
        <Skeleton className="h-40" />
      ) : ai.data?.status === 'ENABLED' ? (
        <Chat />
      ) : (
        <AiUnavailable status={ai.data?.status} action="usar o assistente" />
      )}
    </>
  );
}

function Chat() {
  const questionId = useId();
  const disciplines = useDisciplines();
  const ask = useAskAssistant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (ask.isPending) return;
    const parsed = assistantAskSchema.safeParse({
      question,
      disciplineId: disciplineId ? Number(disciplineId) : null,
      history: messages.slice(-10).map((m) => ({ role: m.role, text: m.text.slice(0, 4000) })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Pergunta inválida');
      return;
    }
    const asked = parsed.data.question;
    setError(null);
    setQuestion('');
    setMessages((current) => [...current, { role: 'user', text: asked }]);
    try {
      const answer = await ask.mutateAsync(parsed.data);
      setMessages((current) => [...current, { role: 'assistant', text: answer.answer, answer }]);
    } catch (err) {
      // A pergunta volta à caixa para se poder tentar outra vez (sem apagar o que entretanto se escreveu).
      setMessages((current) => current.slice(0, -1));
      setQuestion((typed) => typed || asked);
      setError(errorMessage(err));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) void send(e);
  }

  return (
    <div className="space-y-4">
      {messages.length > 0 && (
        <ol role="log" aria-label="Conversa" className="space-y-3">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <li
                key={i}
                className="ml-auto w-fit max-w-[85%] rounded-xl bg-accent px-3 py-2 text-sm whitespace-pre-wrap text-white"
              >
                {m.text}
              </li>
            ) : (
              <li key={i}>{m.answer && <AnswerCard answer={m.answer} />}</li>
            ),
          )}
          {ask.isPending && (
            <li className="text-sm text-stone-600" aria-live="polite">
              A procurar nos teus documentos…
            </li>
          )}
        </ol>
      )}

      <Card>
        <form onSubmit={(e) => void send(e)} className="space-y-3">
          <div>
            <label htmlFor={questionId} className="mb-1 block text-sm font-medium text-stone-700">
              Pergunta
            </label>
            <textarea
              id={questionId}
              rows={3}
              value={question}
              maxLength={1000}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ex.: o que é a terceira forma normal?"
              className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
            />
          </div>
          <SelectField label="Procurar em" value={disciplineId} onChange={(e) => setDisciplineId(e.target.value)}>
            <option value="">Todos os documentos</option>
            {disciplines.data?.map((d) => (
              <option key={d.id} value={d.id}>
                Documentos de {d.code} — {d.name}
              </option>
            ))}
          </SelectField>
          <FormError message={error} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={ask.isPending}>
              <Send aria-hidden="true" className="size-4" />
              Perguntar
            </Button>
            {messages.length > 0 && (
              <Button variant="secondary" disabled={ask.isPending} onClick={() => setMessages([])}>
                Nova conversa
              </Button>
            )}
          </div>
          <p className="text-xs text-stone-600">
            A IA pode enganar-se: confirma nas fontes. As perguntas vão para a Google (Gemini) e, quando os teus
            documentos não chegam, para a Pesquisa Google. A conversa não fica guardada.
          </p>
        </form>
      </Card>
    </div>
  );
}

function AnswerCard({ answer }: { answer: AssistantAnswer }) {
  return (
    <div className="max-w-[95%] space-y-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
      {answer.mode === 'documents' ? (
        <Badge tone="accent">Dos teus documentos</Badge>
      ) : (
        <Badge tone="amber">Fonte web</Badge>
      )}
      <p className="whitespace-pre-wrap text-stone-800">{answer.answer}</p>
      {answer.sources.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stone-600">Fontes</p>
          <ol className="mt-1 space-y-1">
            {answer.sources.map((s) => (
              <li key={s.n} className="text-xs text-stone-700">
                {s.kind === 'document' ? (
                  <details>
                    <summary className="cursor-pointer">
                      [{s.n}]{' '}
                      <Link to={`/documentos/${s.documentId}`} className="font-medium text-accent hover:underline">
                        <FileText aria-hidden="true" className="mr-1 inline size-3" />
                        {s.title}
                      </Link>
                    </summary>
                    <p className="mt-1 rounded bg-stone-50 p-2 whitespace-pre-wrap">{s.excerpt}</p>
                  </details>
                ) : (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent hover:underline"
                  >
                    [{s.n}] {s.title}
                    <ExternalLink aria-hidden="true" className="ml-1 inline size-3" />
                    <span className="sr-only"> (abre noutro separador)</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {answer.searchSuggestionsHtml && <SearchSuggestions html={answer.searchSuggestionsHtml} />}
    </div>
  );
}

/**
 * Sugestões de pesquisa da Google: os termos obrigam a mostrá-las tal como vêm, sem as alterar nem pôr numa
 * moldura (iframe). Ficam num shadow DOM, para o CSS delas não tocar no resto da página; as ligações abrem
 * noutro separador para a conversa (que só existe nesta página) não se perder.
 */
function SearchSuggestions({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = html;
  }, [html]);

  function openInNewTab(e: MouseEvent<HTMLDivElement>) {
    const link = e.nativeEvent.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
    if (!link?.href.startsWith('https://')) return;
    e.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  }

  return <div ref={host} aria-label="Sugestões de pesquisa da Google" role="group" onClick={openInNewTab} />;
}
