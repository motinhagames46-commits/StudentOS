import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import { api, errorMessage } from '../lib/api';
import { dashboardWithoutPendingTasks, pendingTaskDeletes, withoutPendingTasks } from '../lib/pendingTaskDeletes';
import type { Dashboard, Task } from '../lib/types';
import { useInvalidateAll } from './queries';

/**
 * Eliminar uma tarefa com «Desfazer» (em vez do confirm do browser): some logo das listas e o pedido só sai
 * quando o aviso fecha sem «Desfazer». Fechar a página antes disso não apaga nada (falha segura).
 */
export function useDeleteTaskWithUndo() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAll();
  const toast = useToast();

  return (task: Pick<Task, 'id' | 'title'>) => {
    const snapshot = [
      ...queryClient.getQueriesData({ queryKey: ['tasks'] }),
      ...queryClient.getQueriesData({ queryKey: ['dashboard'] }),
    ];
    pendingTaskDeletes.add(task.id);
    queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (list) => list && withoutPendingTasks(list));
    queryClient.setQueryData<Dashboard>(['dashboard'], (d) => d && dashboardWithoutPendingTasks(d));

    toast({
      message: `Tarefa «${task.title}» eliminada.`,
      action: { label: 'Desfazer', onClick: () => undefined },
      onClose: (reason) => {
        pendingTaskDeletes.delete(task.id);
        if (reason === 'action') {
          for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
          return;
        }
        api(`/tasks/${task.id}`, { method: 'DELETE' }).then(
          () => void invalidate(),
          (error: unknown) => {
            void invalidate();
            toast({ message: `Não foi possível eliminar a tarefa: ${errorMessage(error)}`, tone: 'error' });
          },
        );
      },
    });
  };
}
