import { Link } from 'react-router';

/**
 * Página de privacidade (secção 12.4 — transparência RGPD). Descreve só o que o código faz de facto;
 * atualizar sempre que os dados guardados, os prazos de conservação ou o alojamento mudarem.
 */
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
          Serve apenas para ajudares a organizar as tuas tarefas, disciplinas, avaliações e o teu estudo.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Que dados guardamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>O nome e o email com que crias a conta.</li>
          <li>
            A palavra-passe, guardada apenas como <em>hash</em> (bcrypt): não é possível lê-la nem recuperá-la a partir
            do que fica guardado.
          </li>
          <li>
            Os dados académicos que introduzes ou importas: disciplinas, avaliações e notas, tarefas, horário,
            disponibilidade, planos e sessões de estudo.
          </li>
          <li>
            Para cada sessão iniciada: o navegador e sistema (<em>user-agent</em>), quando começou, a última utilização
            e quando expira. Servem para veres e terminares sessões noutros dispositivos na página Conta.
          </li>
        </ul>
        <p>
          Usamos um único cookie, de sessão, necessário para manteres a sessão iniciada. Não há cookies de publicidade
          nem de análise. O endereço IP é usado apenas em memória, durante 15 minutos, para limitar tentativas de
          acesso; não fica guardado na base de dados.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Quanto tempo</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Os dados da conta ficam guardados até eliminares a conta.</li>
          <li>Cada sessão expira 7 dias depois de iniciada, ou antes, quando a terminas.</li>
          <li>
            Os ficheiros que importas não são guardados, só os itens extraídos para a pré-visualização. Esses itens são
            apagados quando confirmas; uma pré-visualização por confirmar expira ao fim de 24 horas e os itens são
            apagados na tua utilização seguinte da importação. Fica um registo de cada importação (nome do ficheiro,
            data e contagens) para a poderes anular.
          </li>
        </ul>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Onde ficam e quem os trata</h2>
        <p>
          A aplicação corre no Render (Frankfurt, Alemanha) e a base de dados no Neon (PostgreSQL, região de Frankfurt),
          ambos na União Europeia, que atuam como subcontratantes de alojamento. Os dados não são vendidos nem
          partilhados com mais ninguém, e nenhum dado é enviado a serviços de inteligência artificial.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Exportar para outro calendário</h2>
        <p>
          Na página Calendário podes descarregar um ficheiro .ics com as sessões de estudo planeadas, as avaliações e os
          prazos das tarefas por fazer (títulos, siglas e nomes das disciplinas, datas e horas). O ficheiro é gerado a
          pedido, só com a sessão iniciada, e não fica guardado no StudentOS; não existe nenhum link público para ele.
          Se o importares no Google Calendar, no Calendário da Apple ou no Outlook, esse serviço passa a ter uma cópia
          desses dados, tratada segundo as regras dele. Eliminar a conta no StudentOS não apaga essa cópia: apaga-a no
          próprio calendário.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Transferir para outra conta</h2>
        <p>
          Na página Conta podes transferir disciplinas (com as avaliações, notas, tarefas, aulas e sessões de estudo
          ligadas a elas) para outra conta tua. A transferência só acontece com um código gerado por ti, válido durante
          30 minutos e uma única vez (só guardamos o hash do código), e depois de confirmares na conta de destino, que
          vê o nome da conta de origem. Os dados saem da conta de origem.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Os teus direitos</h2>
        <p>
          Exerces os teus direitos diretamente na aplicação, sem pedires a ninguém: corriges os dados editando-os, na
          página Conta exportas todos os teus dados em JSON (acesso e portabilidade) e eliminas a conta com todos os
          dados de forma permanente (apagamento).
        </p>
      </div>
    </main>
  );
}
