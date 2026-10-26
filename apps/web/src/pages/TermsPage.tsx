import { TERMS_VERSION } from '@studentos/shared';
import { Link } from 'react-router';

const versionDate = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }).format(
  new Date(`${TERMS_VERSION}T12:00:00Z`),
);

/**
 * Termos de utilização (aceites no registo; a versão aceite fica guardada na conta). Ao mudar o texto de forma
 * relevante, atualizar TERMS_VERSION em packages/shared e avisar na app.
 */
export function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-sm text-stone-600 hover:text-stone-900">
        ← Voltar
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">Termos de utilização</h1>
      <p className="mt-1 text-sm text-stone-600">Versão de {versionDate}.</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-stone-700">
        <h2 className="pt-2 text-base font-semibold text-stone-900">O que é o StudentOS</h2>
        <p>
          Um organizador académico gratuito, disponibilizado por um estudante a título pessoal e sem fins lucrativos.
          Não é um serviço oficial de nenhuma instituição de ensino e não tem relação com o Moodle, o Outlook, o Google
          ou a Apple; os nomes e marcas referidos pertencem aos respetivos titulares.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Quem pode usar</h2>
        <p>
          Pessoas com 16 anos ou mais. Ao criares conta, confirmas que os dados que indicas são verdadeiros e que a
          conta é só tua.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Os cálculos e o plano são indicativos</h2>
        <p>
          As médias, a «nota de que precisas», o ritmo pelos ECTS e o plano de estudo são calculados a partir dos dados
          que introduzes, com as regras explicadas na app. Podem não refletir o regulamento da tua instituição, que é
          sempre o que conta: confirma prazos, pesos e notas oficiais com a tua escola e os teus docentes.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Utilização aceitável</h2>
        <p>Não podes:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>usar a app para fins ilegais ou para prejudicar outras pessoas;</li>
          <li>tentar aceder a contas ou dados que não são teus, ou contornar a segurança e os limites de pedidos;</li>
          <li>usar programas automáticos para fazer pedidos em massa;</li>
          <li>carregar ou importar conteúdo ilegal ou que viole direitos de terceiros.</li>
        </ul>
        <p>Contas que não cumpram estas regras podem ser suspensas ou eliminadas.</p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Os teus dados</h2>
        <p>
          Os dados que introduzes são teus. O que guardamos e porquê está na{' '}
          <Link to="/privacidade" className="text-accent underline">
            Política de privacidade
          </Link>
          . Na página Conta exportas tudo e eliminas a conta quando quiseres.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Disponibilidade</h2>
        <p>
          O serviço é gratuito e fornecido «tal como está», em alojamento gratuito: pode ficar lento, indisponível,
          mudar ou ser descontinuado. Se for descontinuado, avisamos na app com antecedência razoável, sempre que
          possível, para poderes exportar os teus dados. Guarda uma exportação do que for importante para ti.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Responsabilidade</h2>
        <p>
          Na medida máxima permitida por lei, não respondemos por prejuízos resultantes do uso ou da impossibilidade de
          usar a app, como prazos falhados, notas, decisões tomadas com base nos cálculos ou perda de dados. Esta
          limitação não se aplica em caso de dolo ou culpa grave e não afasta direitos que a lei te garanta e que não
          possam ser afastados.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Alterações</h2>
        <p>
          Estes termos podem ser atualizados; a versão e a data ficam no topo da página. Mudanças importantes são
          avisadas na app. Se não concordares com uma nova versão, podes exportar os teus dados e eliminar a conta.
        </p>

        <h2 className="pt-2 text-base font-semibold text-stone-900">Lei aplicável</h2>
        <p>
          Aplica-se a lei portuguesa, sem prejuízo das normas de proteção do consumidor que não possam ser afastadas.
        </p>
      </div>
    </main>
  );
}
