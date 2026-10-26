// Ficheiros para a IA: as fotografias são reduzidas e convertidas para JPEG no próprio telemóvel (menos dados,
// envio mais rápido, e as fotografias HEIC do iPhone passam a um formato aceite). Os PDF seguem tal como estão.
import type { DocumentCreateInput } from '@studentos/shared';

type UploadFile = DocumentCreateInput['files'][number];

/** O texto continua legível e a imagem fica, em regra, abaixo de 1 MB. */
const MAX_SIDE = 2000;

async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/jpeg', 0.85),
  );
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('FileReader'));
    reader.readAsDataURL(blob);
  });
}

export async function toUploadFile(file: File): Promise<UploadFile> {
  if (file.type === 'application/pdf') {
    return { filename: file.name, mimeType: 'application/pdf', data: await toBase64(file) };
  }
  let jpeg: Blob;
  try {
    jpeg = await toJpeg(file);
  } catch {
    throw new Error(`Não foi possível abrir «${file.name}». Usa uma fotografia (JPEG ou PNG) ou um PDF.`);
  }
  return { filename: `${file.name.replace(/\.[^.]+$/, '')}.jpg`, mimeType: 'image/jpeg', data: await toBase64(jpeg) };
}

/** Tamanho real a partir do base64 (para avisar antes de enviar). */
export const decodedBytes = (files: UploadFile[]) =>
  files.reduce((sum, f) => sum + Math.floor((f.data.length * 3) / 4), 0);
