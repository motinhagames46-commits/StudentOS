import { Link } from 'react-router';

/** Página de privacidade (secção 12.4 — transparência RGPD). Rever antes de publicar. */
export function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-sm text-stone-500 hover:text-stone-900">
        ← Voltar
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">Privacidade</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-stone-700">
        <p>
          O StudentOS é um projeto académico desenvolvido no curso de TPSI do Instituto Politécnico de Viana do Castelo.
          Serve apenas para ajudares a organizar as tuas tarefas, disciplinas e avaliações.
        </p>
        <h2 className="pt-2 text-base font-semibold text-stone-900">Que dados guardamos</h2>
        <p>
          O teu nome, o teu email, a palavra-passe (guardada só em forma cifrada, com hash) e os dados académicos que tu
          introduzes. Não usamos cookies de publicidade nem de análise. Usamos só um cookie de sessão, necessário para
          manteres a sessão iniciada.
        </p>
        <h2 className="pt-2 text-base font-semibold text-stone-900">Onde ficam</h2>
        <p>Numa base de dados alojada na União Europeia. Os dados não são partilhados com terceiros.</p>
        <h2 className="pt-2 text-base font-semibold text-stone-900">Os teus direitos</h2>
        <p>
          Na página Conta podes exportar todos os teus dados em JSON e eliminar a conta de forma permanente. Para outras
          questões, contacta o responsável pelo projeto: <em>[preencher contacto]</em>.
        </p>
      </div>
    </main>
  );
}
