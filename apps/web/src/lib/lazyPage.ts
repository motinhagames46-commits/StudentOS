import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'studentos:recarregado-por-nova-versao';

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return true; // sem armazenamento, não arriscar um ciclo de recargas
  }
}

function writeFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(RELOAD_FLAG, '1');
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // modo privado sem armazenamento: ignora
  }
}

/**
 * Página carregada só quando é aberta (a página de entrada não descarrega a app toda).
 * Depois de uma nova publicação os ficheiros antigos deixam de existir: recarrega uma vez para obter a versão nova.
 */
export function lazyPage<K extends string>(load: () => Promise<{ [P in K]: ComponentType }>, name: K) {
  return lazy(async () => {
    try {
      const module = await load();
      writeFlag(false);
      return { default: module[name] };
    } catch (error) {
      if (readFlag()) throw error;
      writeFlag(true);
      window.location.reload();
      return new Promise<never>(() => {});
    }
  });
}
