// Estado das integrações (spec §9, §10). Nunca mostra "Ligado" sem verificação real bem-sucedida.
import { Router } from 'express';
import { createMoodleProvider, createOutlookProvider } from '../integrations/providers.js';

export const integrationsRouter = Router();

integrationsRouter.get('/', async (_req, res) => {
  const [outlook, moodle] = await Promise.all([
    createOutlookProvider().checkConnection(),
    createMoodleProvider({
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      MOODLE_INTEGRATION_MODE: process.env.MOODLE_INTEGRATION_MODE,
    }).checkConnection(),
  ]);

  res.json([
    {
      provider: 'OUTLOOK',
      status: outlook.status,
      available: false,
      reads:
        'Eventos do teu calendário (apenas leitura, permissão Calendars.ReadBasic), para os usar como blocos ocupados.',
      requirement:
        'Requer o registo da aplicação no Microsoft Entra com acesso ao tenant institucional e, possivelmente, aprovação do administrador. Ainda não existe nesta versão.',
      alternative: 'Exporta o calendário do Outlook em .ics e importa-o.',
    },
    {
      provider: 'MOODLE',
      status: moodle.status,
      available: false,
      reads: 'Disciplinas em que estás inscrito, prazos de atividades e eventos do calendário (apenas leitura).',
      requirement:
        'Requer que os Serviços de Informática do IPVC ativem e autorizem os Web Services do Moodle (elearning.ipvc.pt). O StudentOS nunca pede nem guarda a tua palavra-passe do Moodle.',
      alternative: 'No Moodle, abre Calendário → Exportar calendário e importa o .ics: os prazos entram como tarefas.',
    },
  ]);
});
