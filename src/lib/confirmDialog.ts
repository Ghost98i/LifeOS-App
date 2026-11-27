export type ConfirmDialogTone = 'danger' | 'primary';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
}

export interface PromptDialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
}

export type DialogRequest =
  | {
      id: string;
      kind: 'confirm';
      options: ConfirmDialogOptions;
      resolve: (confirmed: boolean) => void;
    }
  | {
      id: string;
      kind: 'prompt';
      options: PromptDialogOptions;
      resolve: (value: string | null) => void;
    };

type DialogListener = (request: DialogRequest) => void;

const listeners = new Set<DialogListener>();

export function subscribeConfirmDialogs(listener: DialogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestConfirm(options: ConfirmDialogOptions): Promise<boolean> {
  if (listeners.size === 0) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const request: DialogRequest = {
      id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: 'confirm',
      options,
      resolve,
    };
    listeners.forEach((listener) => listener(request));
  });
}

export function requestPrompt(options: PromptDialogOptions): Promise<string | null> {
  if (listeners.size === 0) {
    return Promise.resolve(null);
  }
  return new Promise<string | null>((resolve) => {
    const request: DialogRequest = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind: 'prompt',
      options,
      resolve,
    };
    listeners.forEach((listener) => listener(request));
  });
}
