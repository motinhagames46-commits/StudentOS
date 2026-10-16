import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { GradeSimulator } from './GradeSimulator';

// Exemplo da secção 4.1 da especificação (HU03)
const pw = [
  { name: 'Teste 1', weight: 30, score: 12, minScore: null },
  { name: 'Trabalho prático', weight: 30, score: 15, minScore: null },
  { name: 'Exame', weight: 40, score: null, minScore: 8 },
];

it('para passar mostra a nota mínima do exame', () => {
  render(<GradeSimulator assessments={pw} passingGrade={10} />);
  expect(screen.getByText(/Para passar precisas de/)).toHaveTextContent(
    'Para passar precisas de 8,0 na avaliação «Exame» (nota mínima).',
  );
});

it('atualiza para a nota-alvo 14 e 20', async () => {
  render(<GradeSimulator assessments={pw} passingGrade={10} />);
  const input = screen.getByLabelText('Nota que quero');
  await userEvent.clear(input);
  await userEvent.type(input, '14');
  expect(screen.getByText(/Para teres 14 precisas de/)).toHaveTextContent('13,5');

  await userEvent.clear(input);
  await userEvent.type(input, '20');
  expect(screen.getByText(/Não é possível atingir 20/)).toBeInTheDocument();
});
